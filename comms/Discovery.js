/**
 * Servicio de descubrimiento basado en TuyaBroadcast del plugin FU-RAZ
 */

import crypto from 'crypto';
import TuyaPacket from '../utils/TuyaPacket.js';
import udp from "@SignalRGB/udp";
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
            
            // Usar UDP de SignalRGB
            this.socket = udp.createSocket();
            
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
            // Verificar CRC del paquete antes de descifrar
            if (!this.verifyCRC(data)) {
                return; // Ignorar paquetes con CRC inválido
            }
            
            // Intentar descifrar el mensaje de broadcast
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
            this._log('Failed to process broadcast: ' + error.message);
        }
    }

    verifyCRC(data) {
        try {
            if (data.length < 20) return false;
            
            // Extraer CRC del paquete
            const receivedCRC = data.readUInt32BE(data.length - 8);
            
            // Calcular CRC de todo excepto CRC y footer
            const calculatedCRC = TuyaPacket.calculateCRC(data.slice(0, data.length - 8));
            
            return receivedCRC === calculatedCRC;
            
        } catch (error) {
            return false;
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

            const encryptedData = data.slice(16, 16 + dataLength - 8); // Excluir CRC y footer
            
            // Para protocolo 3.4+, usar AES-GCM con clave fija
            if (encryptedData.length >= 28) { // 12 IV + 16 tag mínimo
                // Offsets corregidos basados en FU-RAZ
                const iv = encryptedData.slice(0, 12);
                const ciphertext = encryptedData.slice(12, -16);
                const tag = encryptedData.slice(-16);
                
                try {
                    // Crear AAD basado en el protocolo
                    const aad = this.createBroadcastAAD(data.slice(4, 16)); // seqNo + command + length
                    
                    const decipher = crypto.createDecipheriv('aes-128-gcm', BROADCAST_KEY, iv);
                    decipher.setAAD(aad);
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
            
            // Emitir evento para que index.js llame a service.discoveryComplete
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
