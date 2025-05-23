/**
 * Servicio de descubrimiento basado en TuyaBroadcast del plugin FU-RAZ
 */

import crypto from 'crypto';
import TuyaPacket from '../utils/TuyaPacket.js';
import udp from "@SignalRGB/udp";
import EventEmitter from 'events';

const DISCOVERY_PORT = 6667;
const BROADCAST_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn').digest(); // Clave fija del protocolo Tuya

class TuyaDiscovery extends EventEmitter {
    constructor(options = {}) {
        super();
        this.constructor.name = "TuyaDiscovery";
        this.port = DISCOVERY_PORT;
        this.timeout = options.timeout || 5000;
        this.socket = null;
        this.discoveredDevices = new Map();
        this.isDiscovering = false;
        this.debugMode = options.debugMode || false;
    }

    startDiscovery() {
        if (this.isDiscovering) {
            this._log('Discovery already in progress');
            return;
        }

        try {
            this.isDiscovering = true;
            this.discoveredDevices.clear();
            
            this.socket = udp.createSocket('udp4');
            
            this.socket.on('message', (data, rinfo) => {
                this.handleBroadcastMessage(data, rinfo);
            });
            
            this.socket.on('error', (error) => {
                this._log('Discovery socket error: ' + error.message);
                this.emit('error', error);
                this.stopDiscovery();
            });
            
            this.socket.bind(this.port, () => {
                this._log('Discovery started on port ' + this.port);
                
                setTimeout(() => {
                    this.stopDiscovery();
                }, this.timeout);
            });
            
        } catch (error) {
            this._log('Error starting discovery: ' + error.message);
            this.emit('error', error);
            this.isDiscovering = false;
        }
    }

    handleBroadcastMessage(data, rinfo) {
        try {
            // Verificar CRC del paquete antes de descifrar
            if (!this.verifyCRC(data)) {
                return;
            }
            
            const deviceInfo = this.decryptBroadcast(data, rinfo);
            
            if (deviceInfo && deviceInfo.gwId) {
                const deviceId = deviceInfo.gwId;
                
                if (this.discoveredDevices.has(deviceId)) {
                    return;
                }
                
                deviceInfo.ip = rinfo.address;
                deviceInfo.discoveryPort = rinfo.port;
                deviceInfo.id = deviceId;
                
                this.discoveredDevices.set(deviceId, deviceInfo);
                
                this._log('Device discovered: ' + deviceId + ' at ' + rinfo.address);
                this.emit('deviceDiscovered', deviceInfo);
            }
            
        } catch (error) {
            this._log('Failed to process broadcast: ' + error.message);
        }
    }

    verifyCRC(data) {
        try {
            if (data.length < 20) return false;
            
            const receivedCRC = data.readUInt32BE(data.length - 8);
            const calculatedCRC = TuyaPacket.calculateCRC(data.slice(0, data.length - 8));
            
            return receivedCRC === calculatedCRC;
            
        } catch (error) {
            return false;
        }
    }

    decryptBroadcast(data, rinfo) {
        try {
            if (data.length < 20) {
                return null;
            }

            const header = data.slice(0, 4);
            if (!header.equals(Buffer.from('000055aa', 'hex'))) {
                return null;
            }

            const command = data.readUInt32BE(8);
            const dataLength = data.readUInt32BE(12);
            
            if (dataLength === 0) {
                return null;
            }

            const encryptedData = data.slice(16, 16 + dataLength - 8);
            
            // Para protocolo 3.4+, usar AES-GCM
            if (encryptedData.length >= 28) {
                // Offsets corregidos basados en FU-RAZ
                const iv = encryptedData.slice(0, 12);
                const ciphertext = encryptedData.slice(12, -16);
                const tag = encryptedData.slice(-16);
                
                try {
                    // Crear AAD para broadcast
                    const aad = this.createBroadcastAAD(data.slice(4, 16));
                    
                    const decipher = crypto.createDecipheriv('aes-128-gcm', BROADCAST_KEY, iv);
                    decipher.setAAD(aad);
                    decipher.setAuthTag(tag);
                    
                    let decrypted = decipher.update(ciphertext);
                    decipher.final();
                    
                    const deviceData = JSON.parse(decrypted.toString());
                    return deviceData;
                    
                } catch (decryptError) {
                    // Fallback a texto plano (protocolo 3.3)
                    try {
                        const deviceData = JSON.parse(encryptedData.toString());
                        return deviceData;
                    } catch (jsonError) {
                        return null;
                    }
                }
            }

            return null;
            
        } catch (error) {
            throw error;
        }
    }

    createBroadcastAAD(headerData) {
        // AAD para broadcast basado en FU-RAZ
        const aad = Buffer.alloc(16);
        
        // Copiar seqNo, command, length del header
        headerData.copy(aad, 0, 0, 12);
        
        // Padding con ceros
        aad.fill(0, 12);
        
        return aad;
    }

    stopDiscovery() {
        if (!this.isDiscovering) return;
        
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            
            this.isDiscovering = false;
            this._log('Discovery stopped. Found ' + this.discoveredDevices.size + ' devices');
            
            // Emitir evento para index.js
            this.emit('discoveryStopped');
            
        } catch (error) {
            this._log('Error stopping discovery: ' + error.message);
        }
    }

    _log(message) {
        if (this.debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[TuyaDiscovery ${timestamp}] ${message}`);
        }
    }
}

// Añadir estas propiedades para que SignalRGB lo ignore
TuyaDiscovery.VendorId = () => null;
TuyaDiscovery.ProductId = () => null;

module.exports = TuyaDiscovery;
