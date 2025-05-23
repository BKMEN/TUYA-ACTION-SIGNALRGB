/**
 * Negociador de Session Key basado en TuyaNegotiator.test.js del plugin FU-RAZ
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

const NEGOTIATION_PORT = 40001;
const NEGOTIATION_TIMEOUT = 10000;
const FIXED_KEY = Buffer.from('6f36045d84b042e01e29b7c819e37cf7', 'hex'); // Clave fija del protocolo

class TuyaSessionNegotiator extends EventEmitter {
    constructor(device) {
        super();
        this.device = device;
        this.socket = null;
        this.negotiationTimer = null;
    }

    start() {
        if (!this.device.localKey) {
            this.emit('error', new Error('Local key not set'));
            return;
        }

        try {
            service.log('Starting negotiation for device: ' + this.device.id);
            
            // Crear socket para negociación
            this.socket = udp.createSocket();
            
            this.socket.on('message', (data, rinfo) => {
                this.handleNegotiationResponse(data, rinfo);
            });
            
            this.socket.on('error', (error) => {
                service.log('Negotiation socket error: ' + error.message);
                this.emit('error', error);
                this.cleanup();
            });
            
            this.socket.bind(() => {
                this.sendNegotiationRequest();
                
                // Timeout para la negociación
                this.negotiationTimer = setTimeout(() => {
                    this.emit('error', new Error('Negotiation timeout'));
                    this.cleanup();
                }, NEGOTIATION_TIMEOUT);
            });
            
        } catch (error) {
            service.log('Error starting negotiation: ' + error.message);
            this.emit('error', error);
        }
    }

    sendNegotiationRequest() {
        try {
            // Generar nonce aleatorio
            const nonce = crypto.randomBytes(12);
            
            // Crear payload de negociación
            const timestamp = Math.floor(Date.now() / 1000);
            const payload = JSON.stringify({
                t: timestamp,
                rnd: crypto.randomBytes(16).toString('hex')
            });
            
            // Cifrar con clave fija y nonce
            const cipher = crypto.createCipherGCM('aes-128-gcm', FIXED_KEY);
            let encrypted = cipher.update(payload, 'utf8');
            cipher.final();
            const tag = cipher.getAuthTag();
            
            // Construir paquete Tuya
            const packet = this.buildNegotiationPacket(nonce, encrypted, tag);
            
            service.log('Sending negotiation request to ' + this.device.ip + ':' + NEGOTIATION_PORT);
            
            this.socket.send(packet, NEGOTIATION_PORT, this.device.ip, (error) => {
                if (error) {
                    service.log('Error sending negotiation request: ' + error.message);
                    this.emit('error', error);
                }
            });
            
        } catch (error) {
            service.log('Error creating negotiation request: ' + error.message);
            this.emit('error', error);
        }
    }

    buildNegotiationPacket(nonce, encrypted, tag) {
        // Header Tuya
        const header = Buffer.from('000055aa', 'hex');
        
        // Sequence number
        const seqNo = Buffer.alloc(4);
        seqNo.writeUInt32BE(0, 0);
        
        // Command type (negociación)
        const command = Buffer.from('00000003', 'hex');
        
        // Data (nonce + encrypted + tag)
        const data = Buffer.concat([nonce, encrypted, tag]);
        
        // Data length
        const dataLength = Buffer.alloc(4);
        dataLength.writeUInt32BE(data.length + 8, 0); // +8 para CRC y sufijo
        
        // CRC placeholder
        const crc = Buffer.alloc(4);
        
        // Footer
        const footer = Buffer.from('0000aa55', 'hex');
        
        // Combinar todo
        const packet = Buffer.concat([header, seqNo, command, dataLength, data, crc, footer]);
        
        // Calcular CRC real
        const calculatedCRC = this.calculateCRC(packet.slice(0, packet.length - 8));
        packet.writeUInt32BE(calculatedCRC, packet.length - 8);
        
        return packet;
    }

    handleNegotiationResponse(data, rinfo) {
        try {
            service.log('Received negotiation response from ' + rinfo.address);
            
            // Verificar estructura del paquete
            if (data.length < 20) {
                throw new Error('Invalid response packet');
            }
            
            // Extraer datos cifrados
            const dataLength = data.readUInt32BE(12);
            const encryptedData = data.slice(16, 16 + dataLength - 8);
            
            if (encryptedData.length < 28) { // 12 nonce + 16 tag mínimo
                throw new Error('Invalid encrypted data length');
            }
            
            const nonce = encryptedData.slice(0, 12);
            const ciphertext = encryptedData.slice(12, -16);
            const tag = encryptedData.slice(-16);
            
            // Descifrar usando localKey como clave de negociación
            const negotiationKey = Buffer.from(this.device.localKey, 'hex');
            const decipher = crypto.createDecipherGCM('aes-128-gcm', negotiationKey);
            decipher.setAuthTag(tag);
            
            let decrypted = decipher.update(ciphertext);
            decipher.final();
            
            const responseData = JSON.parse(decrypted.toString());
            
            // Derivar session key usando el token del dispositivo
            const sessionKey = this.deriveSessionKey(responseData.t, this.device.localKey);
            
            if (sessionKey) {
                service.log('Session key negotiated successfully for device: ' + this.device.id);
                this.emit('success', sessionKey);
                this.cleanup();
            } else {
                this.emit('error', new Error('Failed to derive session key'));
                this.cleanup();
            }
            
        } catch (error) {
            service.log('Error processing negotiation response: ' + error.message);
            this.emit('error', error);
            this.cleanup();
        }
    }

    deriveSessionKey(deviceToken, localKey) {
        try {
            // Algoritmo de derivación basado en FU-RAZ
            const key = Buffer.from(localKey, 'hex');
            const payload = Buffer.from(deviceToken.toString());
            
            // HMAC-SHA256 para derivar la session key
            const hmac = crypto.createHmac('sha256', key);
            hmac.update(payload);
            const sessionKey = hmac.digest('hex').slice(0, 32); // Tomar primeros 16 bytes (32 chars hex)
            
            return sessionKey;
            
        } catch (error) {
            service.log('Error deriving session key: ' + error.message);
            return null;
        }
    }

    calculateCRC(data) {
        // Implementación CRC32 simple
        let crc = 0xFFFFFFFF;
        
        for (let i = 0; i < data.length; i++) {
            crc = crc ^ data[i];
            for (let j = 0; j < 8; j++) {
                if (crc & 1) {
                    crc = (crc >>> 1) ^ 0xEDB88320;
                } else {
                    crc = crc >>> 1;
                }
            }
        }
        
        return (~crc) >>> 0;
    }

    cleanup() {
        if (this.negotiationTimer) {
            clearTimeout(this.negotiationTimer);
            this.negotiationTimer = null;
        }
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

export default TuyaSessionNegotiator;
