/**
 * Servicio de descubrimiento de dispositivos Tuya.
 *
 * Maneja el envío y recepción de paquetes UDP de broadcast para localizar
 * dispositivos en la red local. Expone métodos públicos para iniciar y
 * detener el proceso de forma segura.
 */

let udp;
try {
    // Prefer the SignalRGB UDP module if available
    udp = require('@SignalRGB/udp');
} catch (err) {
    // Fallback to Node's built in dgram implementation for development
    udp = require('dgram');
}
const EventEmitter = require('../utils/EventEmitter.js');

class TuyaDiscovery extends EventEmitter {
    constructor(config = {}) {
        super();
        this.isRunning = false;
        this.discoveryPort = config.port || 6666;
        this.broadcastPort = config.broadcastPort || 6667;
        this.devices = new Map();
        this.socket = null;
        this.config = config;
    }

    /**
     * Inicia el proceso de descubrimiento
     */
    start() {
        if (this.isRunning) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                // Crear socket UDP usando SignalRGB UDP
                this.socket = udp.createSocket('udp4');
                
                this.socket.on('message', (msg, rinfo) => {
                    this.handleDiscoveryMessage(msg, rinfo);
                });

                this.socket.on('error', (err) => {
                    console.error('Discovery socket error:', err);
                    this.emit('error', err);
                });

                this.socket.bind(this.discoveryPort, () => {
                    this.socket.setBroadcast(true);
                    this.isRunning = true;
                    this.emit('started');
                    resolve();
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Detiene el descubrimiento
     */
    stop() {
        if (!this.isRunning) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            if (this.socket) {
                this.socket.close(() => {
                    this.isRunning = false;
                    this.socket = null;
                    this.emit('stopped');
                    resolve();
                });
            } else {
                this.isRunning = false;
                resolve();
            }
        });
    }

    /**
     * Maneja mensajes de descubrimiento recibidos
     */
    handleDiscoveryMessage(message, rinfo) {
        try {
            // Procesar mensaje de descubrimiento
            const deviceInfo = this.parseDiscoveryMessage(message, rinfo);
            if (deviceInfo) {
                this.devices.set(deviceInfo.id, deviceInfo);
                this.emit('device_found', deviceInfo);
            }
        } catch (error) {
            console.error('Error processing discovery message:', error);
        }
    }

    /**
     * Parsea mensaje de descubrimiento
     */
    parseDiscoveryMessage(message, rinfo) {
        try {
            // Intentar parsear como JSON
            const data = JSON.parse(message.toString());
            
            return {
                id: data.gwId || data.devId,
                ip: rinfo.address,
                port: rinfo.port,
                productKey: data.productKey,
                version: data.version || '3.3',
                timestamp: Date.now(),
                raw: data
            };
        } catch (error) {
            // Si no es JSON, intentar parsear como paquete binario Tuya
            return this.parseBinaryDiscovery(message, rinfo);
        }
    }

    /**
     * Parsea mensaje binario de descubrimiento
     */
    parseBinaryDiscovery(message, rinfo) {
        // Implementación básica para paquetes binarios
        if (message.length < 20) {
            return null;
        }

        // Verificar prefijo Tuya
        const prefix = message.slice(0, 4).toString('hex');
        if (prefix !== '000055aa') {
            return null;
        }

        return {
            id: `tuya_${rinfo.address}_${rinfo.port}`,
            ip: rinfo.address,
            port: rinfo.port,
            version: '3.3',
            timestamp: Date.now(),
            binary: true
        };
    }

    /**
     * Envía solicitud de descubrimiento por broadcast
     */
    sendDiscoveryRequest() {
        if (!this.isRunning || !this.socket) {
            return Promise.reject(new Error('Discovery not running'));
        }

        return new Promise((resolve, reject) => {
            try {
                // Crear mensaje de descubrimiento simple
                const discoveryMessage = JSON.stringify({
                    cmd: 'discovery',
                    t: Math.floor(Date.now() / 1000)
                });

                const broadcastAddress = '255.255.255.255';
                
                this.socket.send(
                    discoveryMessage,
                    this.broadcastPort,
                    broadcastAddress,
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Obtiene lista de dispositivos encontrados
     */
    getDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * Limpia lista de dispositivos
     */
    clearDevices() {
        this.devices.clear();
        this.emit('devices_cleared');
    }

    /**
     * Alias público para iniciar el descubrimiento.
     * Mantiene compatibilidad con versiones anteriores.
     * @returns {Promise<void>}
     */
    startDiscovery() {
        return this.start();
    }

    /**
     * Alias público para detener el descubrimiento.
     * @returns {Promise<void>}
     */
    stopDiscovery() {
        return this.stop();
    }
}

module.exports = TuyaDiscovery;
