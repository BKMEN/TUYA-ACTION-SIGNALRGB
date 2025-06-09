/**
 * TuyaEncryption.js
 * Utilidades de cifrado para el protocolo Tuya v3.5
 */

import crypto from 'node:crypto';
import TuyaEncryptor from './TuyaEncryptor.js';

const TuyaEncryption = {
    /**
     * Cifra datos con AES-128-GCM
     * @param {string|Buffer} data - Datos a cifrar
     * @param {string|Buffer} key - Clave de 16 bytes (en hex o Buffer)
     * @param {string|Buffer} iv - Vector de inicialización de 12 bytes (en hex o Buffer)
     * @param {string|Buffer} aad - Datos de autenticación adicionales (en hex o Buffer)
     * @returns {{ciphertext: Buffer, tag: Buffer}} - Texto cifrado y tag de autenticación
     */
    encryptGCM: function(data, key, iv, aad) {
        const result = TuyaEncryptor.encrypt(data, Buffer.isBuffer(key) ? key.toString('hex') : key,
            Buffer.isBuffer(iv) ? iv.toString('hex') : iv, aad);
        return result;
    },
    
    /**
     * Descifra datos con AES-128-GCM
     * @param {string|Buffer} ciphertext - Texto cifrado
     * @param {string|Buffer} key - Clave de 16 bytes (en hex o Buffer)
     * @param {string|Buffer} iv - Vector de inicialización de 12 bytes (en hex o Buffer)
     * @param {string|Buffer} tag - Tag de autenticación de 16 bytes (en hex o Buffer)
     * @param {string|Buffer} aad - Datos de autenticación adicionales (en hex o Buffer)
     * @returns {Buffer|null} - Datos descifrados o null si falla autenticación
     */
    decryptGCM: function(ciphertext, key, iv, tag, aad) {
        try {
            const plain = TuyaEncryptor.decrypt(
                ciphertext,
                Buffer.isBuffer(key) ? key.toString('hex') : key,
                Buffer.isBuffer(iv) ? iv.toString('hex') : iv,
                tag,
                aad
            );
            return plain;
        } catch (error) {
            if (typeof service !== 'undefined') {
                service.log('❌ decryptGCM failed: ' + error.message);
            } else {
                console.error('Decryption failed:', error);
            }
            return null;
        }
    },
    
    /**
     * Genera bytes aleatorios en formato hexadecimal
     * @param {number} length - Longitud en bytes
     * @returns {string} - String hexadecimal
     */
    generateRandomHexBytes: function(length) {
        return crypto.randomBytes(length).toString('hex');
    },
    
    /**
     * Deriva la clave de sesión usando los componentes proporcionados
     * @param {string} localKey - Clave local en hex
     * @param {string} clientRandom - Random del cliente en hex
     * @param {string} deviceRandom - Random del dispositivo en hex
     * @returns {string} - Clave de sesión derivada en hex
     */
    deriveSessionKey: function(localKey, clientRandom, deviceRandom) {
        // Formar entrada para MD5: localKey + clientRandom + deviceRandom
        const input = Buffer.from(localKey + clientRandom + deviceRandom, 'hex');
        
        // Calcular hash MD5
        return crypto.createHash('md5').update(input).digest('hex');
    },
    
    /**
     * Construye el AAD (Additional Authenticated Data) para el protocolo Tuya v3.5
     * @param {number} msgType - Tipo de mensaje
     * @param {Buffer|string} seq - Secuencia (4 bytes)
     * @param {number} payloadLen - Longitud del payload
     * @returns {Buffer} - AAD para cifrado GCM
     */
    createAAD: function(msgType, seq, payloadLen) {
        const aadBuffer = Buffer.alloc(12);
        
        // Byte 0-3: Version + reserved (4 bytes) - valor 0x00000000
        aadBuffer.writeUInt32BE(0, 0);
        
        // Byte 4-7: Sequence number (4 bytes)
        const seqBuffer = Buffer.isBuffer(seq) ? seq : Buffer.from(seq, 'hex');
        seqBuffer.copy(aadBuffer, 4, 0, 4);
        
        // Byte 8: Message type (1 byte)
        aadBuffer.writeUInt8(msgType, 8);
        
        // Byte 9-11: Payload length (3 bytes)
        aadBuffer.writeUIntBE(payloadLen, 9, 3);
        
        return aadBuffer;
    },
    
    /**
     * Calcula un HMAC-SHA256
     * @param {string|Buffer} data - Datos para HMAC
     * @param {string|Buffer} key - Clave para HMAC
     * @returns {string} - HMAC en hex
     */
    hmacSHA256: function(data, key) {
        const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
        const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        return crypto.createHmac('sha256', keyBuffer)
            .update(dataBuffer)
            .digest('hex');
    },
    
    /**
     * Calcula un hash MD5
     * @param {string|Buffer} data - Datos para MD5
     * @returns {string} - Hash MD5 en hex
     */
    md5: function(data) {
        const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        return crypto.createHash('md5')
            .update(dataBuffer)
            .digest('hex');
    }
};

export default TuyaEncryption;

