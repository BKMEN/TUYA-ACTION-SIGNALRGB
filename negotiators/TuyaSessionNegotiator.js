/**
 * Negociador de Session Key basado en TuyaNegotiator.test.js del plugin FU-RAZ
 */

const EventEmitter = require('../utils/EventEmitter.js');
import crypto from 'crypto';
import udp from "@SignalRGB/udp";

const NEGOTIATION_PORT = 40001;
const NEGOTIATION_TIMEOUT = 10000;
const FIXED_KEY = Buffer.from('6f36045d84b042e01e29b7c819e37cf7', 'hex');

class TuyaSessionNegotiator extends EventEmitter {
    constructor(device) {
        super();
        this.device = device;
        this.socket = null;
        this.negotiationTimer = null;
        this.negotiationKey = null;
        this.deviceToken = null;
        this.deviceRnd = null;
    }

    start() {
        if (!this.device.localKey) {
            this.emit('error', new Error('Local key not set'));
            return;
        }

        try {
            service.log('Starting negotiation for device: ' + this.device.id);
            
            this.socket = udp.createSocket('udp4');
            
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
            // Generar tokens como FU-RAZ
            this.deviceToken = crypto.randomBytes(16);
            this.deviceRnd = crypto.randomBytes(16);
            
            // Crear payload de negociación compatible con FU-RAZ
            const negotiationData = Buffer.concat([this.deviceToken, this.deviceRnd]);
            
            // Derivar negotiationKey usando localKey (para descifrar respuesta)
            this.negotiationKey = this.deriveNegotiationKey(this.deviceToken, this.device.localKey);
            
            // Generar nonce para cifrado con FIXED_KEY
            const nonce = crypto.randomBytes(12);
            
            // Crear AAD basado en FU-RAZ
            const sequenceNumber = this.device.getNextSequenceNumber();
            const aad = this.createNegotiationAAD(sequenceNumber, negotiationData.length);
            
            // Cifrar con FIXED_KEY
            const cipher = crypto.createCipheriv('aes-128-gcm', FIXED_KEY, nonce);
            cipher.setAAD(aad);
            
            let encrypted = cipher.update(negotiationData);
            cipher.final();
            const tag = cipher.getAuthTag();
            
            // Construir paquete Tuya
            const packet = this.buildNegotiationPacket(nonce, encrypted, tag, sequenceNumber);
            
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
        // AAD complejo basado en FU-RAZ TuyaEncryptor.createAad
        const aad = Buffer.alloc(32);
        let offset = 0;
        
        // versionReserved (4 bytes)
        aad.writeUInt32BE(0x00000000, offset);
        offset += 4;
        
        // reserved (4 bytes) 
        aad.writeUInt32BE(0x00000000, offset);
        offset += 4;
        
        // sequence (4 bytes)
        aad.writeUInt32BE(sequenceNumber, offset);
        offset += 4;
        
        // message type (4 bytes) - 0x05 para negociación según FU-RAZ
        aad.writeUInt32BE(0x05, offset);
        offset += 4;
        
        // negotiator CRC (4 bytes) - usar device ID como CRC
        const deviceCrc = parseInt(this.device.gwId.slice(-8), 16) || 0;
        aad.writeUInt32BE(deviceCrc, offset);
        offset += 4;
        
        // totalLength (4 bytes)
        aad.writeUInt32BE(payloadLength + 28, offset); // +28 para nonce+tag+headers
        offset += 4;
        
        // frameNum (4 bytes)
        aad.writeUInt32BE(0x00000001, offset);
        offset += 4;
        
        // padding (4 bytes)
        aad.writeUInt32BE(0x00000000, offset);
        
        return aad;
    }

    buildNegotiationPacket(nonce, encrypted, tag, sequenceNumber) {
        // Header Tuya
        const header = Buffer.from('000055aa', 'hex');
        
        // Sequence number
        const seqNo = Buffer.alloc(4);
        seqNo.writeUInt32BE(sequenceNumber, 0);
        
        // Command type - 0x05 para negociación
        const command = Buffer.from('00000005', 'hex');
        
        // Data (nonce + encrypted + tag)
        const data = Buffer.concat([nonce, encrypted, tag]);
        
        // Data length
        const dataLength = Buffer.alloc(4);
        dataLength.writeUInt32BE(data.length + 8, 0);
        
        // CRC placeholder
        const crc = Buffer.alloc(4);
        
        // Footer
        const footer = Buffer.from('0000aa55', 'hex');
        
        const packet = Buffer.concat([header, seqNo, command, dataLength, data, crc, footer]);
        
        // Calcular CRC real
        const calculatedCRC = this.calculateCRC(packet.slice(0, packet.length - 8));
        packet.writeUInt32BE(calculatedCRC, packet.length - 8);
        
        return packet;
    }

    handleNegotiationResponse(data, rinfo) {
        try {
            service.log('Received negotiation response from ' + rinfo.address);
            
            if (data.length < 20) {
                throw new Error('Invalid response packet');
            }
            
            // Verificar CRC
            const calculatedCRC = this.calculateCRC(data.slice(0, data.length - 8));
            const receivedCRC = data.readUInt32BE(data.length - 8);
            
            if (calculatedCRC !== receivedCRC) {
                throw new Error('CRC mismatch in negotiation response');
            }
            
            // Extraer datos cifrados
            const dataLength = data.readUInt32BE(12);
            const encryptedData = data.slice(16, 16 + dataLength - 8);
            
            if (encryptedData.length < 28) {
                throw new Error('Invalid encrypted data length');
            }
            
            const nonce = encryptedData.slice(0, 12);
            const ciphertext = encryptedData.slice(12, -16);
            const tag = encryptedData.slice(-16);
            
            // Crear AAD para descifrado de respuesta
            const responseAAD = this.createResponseAAD(data.slice(4, 16));
            
            // Descifrar usando negotiationKey (clave intermedia)
            const decipher = crypto.createDecipheriv('aes-128-gcm', this.negotiationKey, nonce);
            decipher.setAAD(responseAAD);
            decipher.setAuthTag(tag);
            
            let decrypted = decipher.update(ciphertext);
            decipher.final();
            
            // Derivar session key final usando protocolo FU-RAZ
            const sessionKey = this.deriveSessionKeyFinal(decrypted);
            
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

    createResponseAAD(headerData) {
        // AAD para descifrar respuesta
        const aad = Buffer.alloc(16);
        headerData.copy(aad, 0, 0, 12);
        aad.fill(0, 12);
        return aad;
    }

    deriveNegotiationKey(deviceToken, localKey) {
        try {
            // Algoritmo FU-RAZ: cifrar deviceToken con localKey
            const key = Buffer.from(localKey, 'hex');
            const nonce = deviceToken.slice(0, 12); // Usar parte del token como nonce
            
            const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
            let encrypted = cipher.update(deviceToken);
            cipher.final();
            
            return encrypted.slice(0, 16);
            
        } catch (error) {
            service.log('Error deriving negotiation key: ' + error.message);
            return null;
        }
    }

    deriveSessionKeyFinal(responseData) {
        try {
            // Extraer sessionToken de la respuesta (protocolo FU-RAZ)
            const sessionToken = responseData.slice(0, 16);
            
            // Derivar sessionKey final: cifrar sessionToken con negotiationKey
            const nonce = this.deviceRnd.slice(0, 12);
            
            const cipher = crypto.createCipheriv('aes-128-gcm', this.negotiationKey, nonce);
            let encrypted = cipher.update(sessionToken);
            cipher.final();
            
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
