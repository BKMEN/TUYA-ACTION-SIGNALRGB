/**
 * Encriptador de comandos basado en TuyaEncryptor del plugin FU-RAZ
 */

import crypto from 'crypto';

class TuyaCommandEncryptor {
    constructor(sessionKey) {
        this.sessionKey = Buffer.from(sessionKey, 'hex');
    }

    encryptCommand(payload, sequenceNumber = 0) {
        try {
            // Generar nonce aleatorio de 12 bytes
            const nonce = crypto.randomBytes(12);
            
            // Crear AAD
            const aad = this.createAAD(sequenceNumber, payload.length);
            
            // CORREGIDO: Crear cipher AES-GCM con nonce
            const cipher = crypto.createCipheriv('aes-128-gcm', this.sessionKey, nonce);
            cipher.setAAD(aad);
            
            // Cifrar payload
            let encrypted = cipher.update(payload, 'utf8');
            cipher.final();
            
            // Obtener tag de autenticación
            const tag = cipher.getAuthTag();
            
            // Construir paquete final
            const encryptedPacket = this.buildEncryptedPacket(
                nonce,
                encrypted,
                tag,
                sequenceNumber
            );
            
            service.log('Command encrypted successfully, packet size: ' + encryptedPacket.length);
            return encryptedPacket;
            
        } catch (error) {
            service.log('Error encrypting command: ' + error.message);
            throw error;
        }
    }

    createAAD(sequenceNumber, payloadLength) {
        // Crear AAD basado en el formato de FU-RAZ
        const aad = Buffer.alloc(16);
        
        // Sequence number (4 bytes)
        aad.writeUInt32BE(sequenceNumber, 0);
        
        // Command type (4 bytes) - comando de control
        aad.writeUInt32BE(0x07, 4);
        
        // Payload length (4 bytes)
        aad.writeUInt32BE(payloadLength, 8);
        
        // Reserved (4 bytes)
        aad.writeUInt32BE(0x00, 12);
        
        return aad;
    }

    buildEncryptedPacket(nonce, encrypted, tag, sequenceNumber) {
        // Header Tuya
        const header = Buffer.from('000055aa', 'hex');
        
        // Sequence number
        const seqBuffer = Buffer.alloc(4);
        seqBuffer.writeUInt32BE(sequenceNumber, 0);
        
        // Command type (datos cifrados)
        const commandType = Buffer.from('00000007', 'hex');
        
        // Data: nonce + encrypted + tag
        const data = Buffer.concat([nonce, encrypted, tag]);
        
        // Data length
        const dataLength = Buffer.alloc(4);
        dataLength.writeUInt32BE(data.length + 8, 0); // +8 para CRC y sufijo
        
        // CRC placeholder
        const crc = Buffer.alloc(4);
        
        // Footer
        const footer = Buffer.from('0000aa55', 'hex');
        
        // Combinar todas las partes
        const packet = Buffer.concat([
            header,
            seqBuffer,
            commandType,
            dataLength,
            data,
            crc,
            footer
        ]);
        
        // Calcular y establecer CRC
        const calculatedCRC = this.calculateCRC(packet.slice(0, packet.length - 8));
        packet.writeUInt32BE(calculatedCRC, packet.length - 8);
        
        return packet;
    }

    calculateCRC(data) {
        // CRC32 compatible con Tuya
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
}

export default TuyaCommandEncryptor;
