/**
 * Negociador de Session Key basado en TuyaNegotiator.test.js del plugin FU-RAZ
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import udp from "@SignalRGB/udp";

const NEGOTIATION_PORT = 40001;
const NEGOTIATION_TIMEOUT = 10000;
const FIXED_KEY = Buffer.from('6f36045d84b042e01e29b7c819e37cf7', 'hex'); // Clave fija del protocolo FU-RAZ

class TuyaSessionNegotiator extends EventEmitter {
    constructor(device) {
        super();
        this.device = device;
        this.socket = null;
        this.negotiationTimer = null;
        this.negotiationKey = null; // Clave intermedia para descifrar respuesta
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
            
            // Crear payload de negociación con token del dispositivo
            const timestamp = Math.floor(Date.now() / 1000);
            const deviceToken = crypto.randomBytes(16).toString('hex');
            
            const payload = JSON.stringify({
                t: timestamp,
                rnd: deviceToken
            });

            // Derivar negotiationKey usando localKey (para descifrar respuesta posterior)
            this.negotiationKey = this.deriveNegotiationKey(deviceToken, this.device.localKey);
            
            // Crear AAD basado en FU-RAZ
            const aad = this.createNegotiationAAD(this.device.getNextSequenceNumber(), payload.length);
            
            // Cifrar con clave fija y nonce
            const cipher = crypto.createCipheriv('aes-128-gcm', FIXED_KEY, nonce);
            cipher.setAAD(aad);
            
            let encrypted = cipher.update(payload, 'utf8');
            cipher.final();
            const tag = cipher.getAuthTag();
            
            // Construir paquete Tuya
            const packet = this.buildNegotiationPacket(nonce, encrypted, tag, aad);
            
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

    createNegotiationAAD(sequenceNumber, payloadLength) {
        // AAD basado en FU-RAZ para negociación
        const aad = Buffer.alloc(16);
        
        // Sequence number (4 bytes)
        aad.writeUInt32BE(sequenceNumber, 0);
        
        // Command type para negociación (4 bytes)
        aad.writeUInt32BE(0x03, 4);
        
        // Payload length (4 bytes)
        aad.writeUInt32BE(payloadLength, 8);
        
        // Device CRC o identificador (4 bytes) - usar gwId convertido
        const deviceId = parseInt(this.device.gwId.slice(-8), 16) || 0;
        aad.writeUInt32BE(deviceId, 12);
        
        return aad;
    }

    buildNegotiationPacket(nonce, encrypted, tag, aad) {
        // Header Tuya
        const header = Buffer.from('000055aa', 'hex');
        
        // Sequence number
        const seqNo = Buffer.alloc(4);
        seqNo.writeUInt32BE(this.device.getNextSequenceNumber(), 0);
        
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
            
            // Verificar CRC del paquete
            const calculatedCRC = this.calculateCRC(data.slice(0, data.length - 8));
            const receivedCRC = data.readUInt32BE(data.length - 8);
            
            if (calculatedCRC !== receivedCRC) {
                throw new Error('CRC mismatch in negotiation response');
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
            
            // Descifrar usando negotiationKey (clave intermedia)
            const decipher = crypto.createDecipheriv('aes-128-gcm', this.negotiationKey, nonce);
            decipher.setAuthTag(tag);
            
            let decrypted = decipher.update(ciphertext);
            decipher.final();
            
            const responseData = JSON.parse(decrypted.toString());
            
            // Derivar session key final usando el protocolo FU-RAZ
            const sessionKey = this.deriveSessionKeyFinal(responseData, this.device.localKey);
            
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

    deriveNegotiationKey(deviceToken, localKey) {
        try {
            // Algoritmo de derivación basado en FU-RAZ: cifrar token con localKey
            const key = Buffer.from(localKey, 'hex');
            const nonce = crypto.randomBytes(12);
            
            const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
            let encrypted = cipher.update(deviceToken, 'utf8');
            cipher.final();
            
            // Usar los primeros 16 bytes del encrypted como negotiationKey
            return encrypted.slice(0, 16);
            
        } catch (error) {
            service.log('Error deriving negotiation key: ' + error.message);
            return null;
        }
    }

    deriveSessionKeyFinal(responseData, localKey) {
        try {
            // Algoritmo de derivación final basado en FU-RAZ
            const key = this.negotiationKey;
            const payload = JSON.stringify(responseData);
            const nonce = crypto.randomBytes(12);
            
            const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
            let encrypted = cipher.update(payload, 'utf8');
            cipher.final();
            
            // Los primeros 16 bytes del resultado son la sessionKey
            return encrypted.slice(0, 16).toString('hex');
            
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
