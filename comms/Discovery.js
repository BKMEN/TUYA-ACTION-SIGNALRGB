/**
 * Servicio de descubrimiento basado en TuyaBroadcast del plugin FU-RAZ
 */

import crypto from 'crypto';
import dgram from 'dgram';
import EventEmitter from 'events';
import os from 'os';

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
            
            // Crear socket UDP para escuchar broadcasts
            this.socket = dgram.createSocket('udp4');
            
            this.socket.on('message', (data, rinfo) => {
                this.handleBroadcastMessage(data, rinfo);
            });
            
            this.socket.on('error', (error) => {
                this._log('Discovery socket error: ' + error.message);
                this.emit('error', error);
                this.stopDiscovery();
            });
            
            // Bind al puerto de descubrimiento
            this.socket.bind(this.port, () => {
                this._log('Discovery started on port ' + this.port);
                
                // Auto-stop después del timeout
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
            // Intentar descifrar el mensaje de broadcast usando el protocolo FU-RAZ
            const deviceInfo = this.decryptBroadcast(data, rinfo);
            
            if (deviceInfo && deviceInfo.gwId) {
                const deviceId = deviceInfo.gwId;
                
                // Evitar duplicados
                if (this.discoveredDevices.has(deviceId)) {
                    return;
                }
                
                // Agregar información de red
                deviceInfo.ip = rinfo.address;
                deviceInfo.discoveryPort = rinfo.port;
                deviceInfo.id = deviceId;
                
                this.discoveredDevices.set(deviceId, deviceInfo);
                
                this._log('Device discovered: ' + deviceId + ' at ' + rinfo.address);
                this.emit('deviceDiscovered', deviceInfo);
            }
            
        } catch (error) {
            // Ignorar mensajes que no se pueden descifrar
            this._log('Failed to decrypt broadcast: ' + error.message);
        }
    }

    decryptBroadcast(data, rinfo) {
        try {
            // Verificar estructura básica del paquete Tuya
            if (data.length < 20) {
                return null;
            }

            // Verificar header Tuya
            const header = data.slice(0, 4);
            if (!header.equals(Buffer.from('000055aa', 'hex'))) {
                return null;
            }

            const command = data.readUInt32BE(8);
            const dataLength = data.readUInt32BE(12);
            
            if (dataLength === 0) {
                return null;
            }

            const encryptedData = data.slice(16, 16 + dataLength - 8); // Excluir CRC
            
            // Para protocolo 3.4+, usar AES-GCM con clave fija
            if (encryptedData.length >= 12) {
                const iv = encryptedData.slice(0, 12);
                const ciphertext = encryptedData.slice(12, -16);
                const tag = encryptedData.slice(-16);
                
                try {
                    const decipher = crypto.createDecipherGCM('aes-128-gcm', BROADCAST_KEY);
                    decipher.setAuthTag(tag);
                    
                    let decrypted = decipher.update(ciphertext);
                    decipher.final();
                    
                    const deviceData = JSON.parse(decrypted.toString());
                    return deviceData;
                    
                } catch (decryptError) {
                    // Intentar como texto plano (protocolo 3.3)
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

    stopDiscovery() {
        if (!this.isDiscovering) return;
        
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            
            this.isDiscovering = false;
            this._log('Discovery stopped. Found ' + this.discoveredDevices.size + ' devices');
            
            // Emitir evento de finalización
            if (typeof service.discoveryComplete === 'function') {
                service.discoveryComplete();
            }
            
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
