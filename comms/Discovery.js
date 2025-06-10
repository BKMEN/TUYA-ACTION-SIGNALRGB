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
    ({ default: udp } = await import('@SignalRGB/udp'));
} catch (err) {
    // Fallback to Node's built in dgram implementation for development
    udp = await import('node:dgram');
}
import EventEmitter from '../utils/EventEmitter.js';
import crypto from 'node:crypto';
import TuyaEncryption from '../negotiators/TuyaEncryption.js';
import gcmBuffer from '../negotiators/GCMBuffer.js';
import DeviceList from '../DeviceList.js';
const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest();

function friendly(id) {
    if (DeviceList && typeof DeviceList.getFriendlyName === 'function') {
        return DeviceList.getFriendlyName(id);
    }
    return id;
}

class TuyaDiscovery extends EventEmitter {
    constructor(config = {}) {
        super();
        this.isRunning = false;
        // Port used to send the broadcast discovery request
        this.discoveryPort = config.port || 6666;
        // Port where we listen for responses. Tuya devices usually reply on
        // 6667, but allow overriding via config.
        this.listenPort = config.listenPort || 6667;
        // Destination port for the broadcast request (defaults to 6666)
        this.broadcastPort = config.broadcastPort || 6666;
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
                    const header = msg.toString('hex', 0, 4);

                    if (header === '00006699') {
                        const command = msg.readUInt32BE(8);
                        if (command === 0x06) {
                            // Paquete de negociación v3.5
                            this.emit('negotiation_packet', msg, rinfo);
                            return;
                        }
                        // Paquete de descubrimiento cifrado
                        this.handleDiscoveryMessage(msg, rinfo);
                        return;
                    }

                    if (header === '000055aa') {
                        const command = msg.readUInt32BE(8);
                        if (command === 0x06) {
                            // Handshake response (protocolo antiguo)
                            this.emit('negotiation_packet', msg, rinfo);
                            return;
                        }
                    }

                    // Fallback to original handler for unsupported packets
                    this.handleDiscoveryMessage(msg, rinfo);
                });

                this.socket.on('error', (err) => {
                    console.error('Discovery socket error:', err);
                    this.emit('error', err);
                });

                this.socket.bind(this.listenPort, () => {
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
                    const summary = [];
                    for (const dev of this.devices.values()) {
                        summary.push({ id: friendly(dev.id), ip: dev.ip, status: 'found' });
                    }
                    console.table(summary);
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
            console.log("🧩 Procesando mensaje:", message.toString('hex').slice(0, 20));
            const prefix = message.slice(0, 4);
            let deviceInfo = null;

            if (prefix.equals(Buffer.from([0x00, 0x00, 0x66, 0x99]))) {
                console.log('DiscoveryService: GCM packet detected from', rinfo.address);
                deviceInfo = this.parseGcmDiscovery(message, rinfo);
            } else {
                // Log raw message to help debugging parsing issues
                console.log('Discovery raw message:', message.toString());
                deviceInfo = this.parseDiscoveryMessage(message, rinfo);
            }

            if (deviceInfo && deviceInfo.id) {
                if (this.devices.has(deviceInfo.id)) return;
                console.log("📦 Dispositivo descubierto:", deviceInfo); // DEBUG
                this.devices.set(deviceInfo.id, deviceInfo);
                this.emit('device_found', deviceInfo);
                console.log(`✅ Dispositivo descubierto: ${friendly(deviceInfo.id)} (${deviceInfo.ip})`);
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
            // Intentar parsear como JSON (elimina nulos o espacios)
            const dataStr = message.toString().replace(/\0+$/, '').trim();
            const data = JSON.parse(dataStr);
            
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
     * Parsea mensaje cifrado con GCM (protocolo 3.4+)
     */
    parseGcmDiscovery(message, rinfo) {
        const data = this.decryptGCM(message);
        if (!data) {
            console.log('DiscoveryService: unable to decrypt GCM packet');
            return null;
        }

        gcmBuffer.add(rinfo.address, message);

        return {
            id: data.gwId || data.devId,
            ip: rinfo.address,
            port: rinfo.port,
            productKey: data.productKey,
            version: data.version || '3.4',
            timestamp: Date.now(),
            raw: data
        };
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
     * Convierte bytes en string hexadecimal
     */
    toHexString(byteArray) {
        return Array.from(byteArray, (byte) => {
            return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }).join('');
    }

    /**
     * Descifra un paquete GCM proveniente de broadcast
     */
    decryptGCM(buffer) {
        try {
            const aad = buffer.slice(4, 18);
            const iv = buffer.slice(18, 30);
            const ciphertext = buffer.slice(30, -20);
            const tag = buffer.slice(-20, -4);

            const decrypted = TuyaEncryption.decryptGCM(ciphertext, UDP_KEY, iv, tag, aad);
            if (!decrypted) {
                return null;
            }

            const jsonString = decrypted.slice(4).toString().replace(/\0+$/, '').trim();
            return JSON.parse(jsonString);
        } catch (err) {
            if (err.stack) {
                console.log('decryptGCM error stack:', err.stack);
            } else {
                console.log('decryptGCM error:', err.message);
            }
            return null;
        }
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
                console.log('TuyaDiscovery: Preparing discovery request');
                console.log("📡 Enviando solicitud de descubrimiento...");
                // Crear mensaje de descubrimiento simple
                const discoveryMessage = JSON.stringify({
                    cmd: 'discovery',
                    t: Math.floor(Date.now() / 1000)
                });

                const broadcastAddress = '255.255.255.255';
                console.log('Broadcasting on:', broadcastAddress + ':' + this.discoveryPort);
                
                this.socket.send(
                    discoveryMessage,
                    this.discoveryPort,
                    broadcastAddress,
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            console.log('TuyaDiscovery: Discovery request sent');
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

export default TuyaDiscovery;

