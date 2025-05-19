/**
 * Clase para descubrir dispositivos Tuya en la red local.
 * Implementa el protocolo de descubrimiento UDP de Tuya y emite eventos
 * cuando se encuentran dispositivos.
 * 
 * @author BKMEN
 * @version 1.0.0
 */

const dgram = require('dgram');
const EventEmitter = require('events');
const os = require('os');
let crypto;

// PROBLEMA: Intenta cargar un módulo personalizado de crypto
try {
    crypto = require('../crypto');
    if (!crypto) {
        throw new Error('Crypto module is not loaded');
    }
    if (typeof crypto.createDiscoveryPacket !== 'function') {
        console.error('Failed to load crypto module: - Using emergency fallback. Note: This fallback is not recommended for production as it may lack proper security and functionality.');
        throw new Error('Invalid crypto module implementation: createDiscoveryPacket is not a function');
    }
    if (typeof crypto.parseDiscoveryResponse !== 'function') {
        console.error('Crypto module is missing the parseDiscoveryResponse function');
        throw new Error('Invalid crypto module implementation: parseDiscoveryResponse is not a function');
    }
} catch (err) {
    console.error('Failed to load crypto module:', err.message);
    // Fallback de emergencia (no recomendado)
    crypto = {
        // Fallback implementation for createDiscoveryPacket.
        // WARNING: This uses a hardcoded buffer and may become incompatible if the Tuya protocol changes.
        // To update this fallback, replace the buffer with the correct discovery packet format.
        createDiscoveryPacket: () => Buffer.from('000055aa00000000000000070000000100000000', 'hex'),
        parseDiscoveryResponse: (msg, rinfo) => {
            console.warn('Fallback parseDiscoveryResponse called. This may not provide accurate results.');
            return { message: msg.toString(), remoteInfo: rinfo };
        }
    };
}

class TuyaDiscovery extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port !== undefined ? options.port : 6667;
        this.timeout = options.timeout || 5000;
        this.broadcastAddress = Array.isArray(options.broadcastAddress) 
            ? options.broadcastAddress 
            : (options.broadcastAddress ? [options.broadcastAddress] : this._getBroadcastAddresses());
        this.retries = options.retries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.debugMode = options.debugMode || false;
        this.logger = options.logger || console;
        this.defaultBroadcastAddress = options.defaultBroadcastAddress || '255.255.255.255';
        this.includeRawData = options.includeRawData || false;

        // The `socket` property is used to manage the UDP socket for sending and receiving discovery packets.
        // It is initialized as `null` and created when discovery starts. It is closed and set back to `null` when discovery stops.
        this.socket = null;
        this.devices = {};
        this.discoveryRunning = false;
        this.currentRetry = 0;
        this.discoveryTimer = null;
    }

    discover() {
        return new Promise((resolve, reject) => {
            if (this.discoveryRunning) {
                reject(new Error('Discovery already running'));
                return;
            }
            this.discoveryRunning = true;
            this.devices = {};
            this.currentRetry = 0;
            this._log('Starting Tuya device discovery');
            this._startDiscovery();
            this.once('done', (devices) => {
                this.discoveryRunning = false;
                resolve(devices);
            });
            this.once('error', (err) => {
                this.discoveryRunning = false;
                if (this.socket) {
                    this.socket.close();
                    this.socket = null;
                }
                reject(err);
            });
        });
    }

    stop() {
        if (this.discoveryRunning) {
            if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            this.discoveryRunning = false;
            this.emit('done', Object.values(this.devices));
        } else {
            this._log('Stop called but discovery was not running. No event emitted.');
        }
    }

    update() {
        return this.discover();
    }

    _startDiscovery() {
        if (this.socket) {
            this._log('Closing existing socket before starting discovery');
            this.socket.close();
            this.socket = null;
        }
        try {
            this.socket = dgram.createSocket('udp4');
            this.socket.on('error', (err) => {
                this._log(`Socket error: ${err.message}`);
                this.emit('error', err);
            });
            this.socket.on('message', this._handleDiscoveryResponse.bind(this));
            this.socket.bind((err) => {
                if (err) {
                    this._log(`Error binding socket: ${err.message}`);
                    this.emit('error', err);
                    return; // Termina aquí si hay error al hacer bind
                }
                this.socket.setBroadcast(true);
                this._sendDiscoveryPackets();
                if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
                this.discoveryTimer = setTimeout(() => {
                    if (this.currentRetry < this.retries - 1) {
                        this.currentRetry++;
                        this._log(`Retry ${this.currentRetry}/${this.retries}`);
                        this._sendDiscoveryPackets();
                    } else {
                        this._finalizeDiscovery();
                    }
                }, this.timeout);
            });
        } catch (err) {
            this._log(`Error starting discovery: ${err.message}`);
            this.emit('error', err);
        }
    }

    _handleDiscoveryResponse(msg, rinfo) {
        try {
            const deviceInfo = crypto.parseDiscoveryResponse(msg, rinfo);
            if (deviceInfo && typeof deviceInfo === 'object' && deviceInfo.id && deviceInfo.ip) {
                if (!this.devices[deviceInfo.id] ||
                    JSON.stringify(this.devices[deviceInfo.id]) !== JSON.stringify(deviceInfo)) {
                    this.devices[deviceInfo.id] = deviceInfo;
                    this._log(`Device found: ${deviceInfo.id} (${deviceInfo.ip})`);
                    this.emit('device', deviceInfo);
                }
            } else {
                this._log('Invalid device information received, skipping.');
            }
        } catch (err) {
            this._log(`Error processing response: ${err.message}`);
        }
    }

    _sendDiscoveryPackets() {
        try {
            const discoveryPacket = crypto.createDiscoveryPacket();
            const addresses = Array.isArray(this.broadcastAddress) ? this.broadcastAddress : [this.broadcastAddress];
            addresses.forEach(address => {
                this._log(`Sending discovery packet to ${address}:${this.port}`);
                this._sendWithRetry(discoveryPacket, address, this.port);
            });
        } catch (err) {
            this._log(`Error creating discovery packet: ${err.message}`);
            this.emit('error', err);
        }
    }

    _sendWithRetry(packet, address, port, attempt = 0, maxRetries = 3) {
        this.socket.send(packet, 0, packet.length, port, address, (err) => {
            if (err) {
                this._log(`Error sending to ${address}: ${err.message}`);
                if (attempt < maxRetries) {
                    this._log(`Retrying send to ${address} (${attempt + 1}/${maxRetries})`);
                    this._sendWithRetry(packet, address, port, attempt + 1, maxRetries);
                } else {
                    this._log(`Failed to send to ${address} after ${maxRetries} attempts`);
                }
            }
        });
    }

    _finalizeDiscovery() {
        this._log(`Discovery complete, found ${Object.keys(this.devices).length} devices`);
        if (this.discoveryTimer) {
            clearTimeout(this.discoveryTimer);
            this.discoveryTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.discoveryRunning = false;
        this.emit('done', Object.values(this.devices));
    }

    _getBroadcastAddresses() {
        const addresses = [];
        const interfaces = os.networkInterfaces();
        Object.keys(interfaces).forEach((ifaceName) => {
            interfaces[ifaceName].forEach((iface) => {
                if (iface.family === 'IPv4' && !iface.internal && iface.address && iface.netmask) {
                    try {
                        const ipParts = iface.address.split('.').map(Number);
                        const netmaskParts = iface.netmask.split('.').map(Number);
                        
                        // Calculate broadcast address
                        if (ipParts.length === 4 && netmaskParts.length === 4) {
                            const broadcastParts = ipParts.map((part, i) => {
                                return (part & netmaskParts[i]) | (~netmaskParts[i] & 255);
                            });
                            addresses.push(broadcastParts.join('.'));
                        } else {
                            this._log(`Invalid IPv4 address or netmask: ${iface.address}, ${iface.netmask}`);
                        }
                    } catch (err) {
                        this._log(`Error processing interface ${ifaceName}: ${err.message}`);
                    }
                }
            });
        });
        
        // If no valid addresses found, use default broadcast address
        if (addresses.length === 0 && this.defaultBroadcastAddress) {
            addresses.push(this.defaultBroadcastAddress);
        }
        
        return addresses;
    }

    _log(message) {
        if (this.debugMode && this.logger) {
            const timestamp = new Date().toISOString();
            if (typeof this.logger.log === 'function') {
                this.logger.log(`[TuyaDiscovery ${timestamp}] ${message}`);
            } else {
                console.log(`[TuyaDiscovery ${timestamp}] ${message}`);
            }
        }
    }
}

module.exports = TuyaDiscovery;
