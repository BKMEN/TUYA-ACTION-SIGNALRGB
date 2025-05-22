/**
 * TuyaPacket.js
 * Maneja la creación y parseo de paquetes de protocolo Tuya
 */

const crypto = require('crypto');

// Constantes del protocolo Tuya
const TUYA_HEADER = '000055aa'; // Prefijo para protocolo v3.1
const TUYA_HEADER_V35 = '00006699'; // Prefijo para protocolo v3.5
const TUYA_TAIL = '0000aa55'; // Sufijo para protocolo v3.1
const TUYA_TAIL_V35 = '00009966'; // Sufijo para protocolo v3.5

// Tipos de mensajes
const MESSAGE_TYPES = {
    CONTROL: 0x07,           // Control de dispositivo (v3.1)
    STATUS: 0x08,            // Actualización de estado (v3.1)
    HEART_BEAT: 0x09,        // Latido (v3.1)
    DP_QUERY: 0x0a,          // Consulta DP (v3.1)
    CONTROL_NEW: 0x0d,       // Control con respuesta (v3.1)
    DP_QUERY_NEW: 0x0f,      // Consulta DP con respuesta (v3.1)
    SESS_KEY_NEG_REQ: 0x05,  // Solicitud negociación de clave (v3.5)
    SESS_KEY_NEG_RESP: 0x06, // Respuesta negociación de clave (v3.5)
    SESS_KEY_CMD: 0x10       // Comando con clave de sesión (v3.5)
};

// Función para generar bytes aleatorios en formato hex
function generateRandomHexBytes(length) {
    return crypto.randomBytes(length).toString('hex');
}

// Calcular CRC32
function calculateCRC32(buffer) {
    const crc32Table = [];
    
    // Generar la tabla CRC
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crc32Table[i] = c;
    }
    
    // Calcular CRC
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < buffer.length; i++) {
        crc = crc32Table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const TuyaPacket = {
    /**
     * Construye un paquete para el protocolo Tuya v3.1
     * @param {string} command - Comando en formato JSON 
     * @param {number} msgType - Tipo de mensaje
     * @param {string} deviceKey - Clave local del dispositivo (hex)
     * @returns {Buffer} - Paquete completo
     */
    buildV31Packet: function(command, msgType, deviceKey) {
        // Convertir comando a Buffer
        const commandBuffer = Buffer.from(command);
        
        // Calcular longitud total y calcular CRC
        const len = 0 + commandBuffer.length;
        
        // Crear buffer para los datos
        const dataBuffer = Buffer.alloc(16 + len);
        
        // Escribir encabezado
        dataBuffer.write(TUYA_HEADER, 0, 'hex');
        
        // Escribir versión 0x00, 0x00, 0x00, 0x00
        dataBuffer.writeUInt32BE(0, 4);
        
        // Escribir tipo de comando
        dataBuffer.writeUInt32BE(msgType, 8);
        
        // Escribir longitud
        dataBuffer.writeUInt32BE(len, 12);
        
        // Escribir datos de comando
        commandBuffer.copy(dataBuffer, 16);
        
        // Calcular CRC
        const crc = calculateCRC32(dataBuffer.slice(0, 16 + len));
        
        // Crear buffer final con CRC y tail
        const finalBuffer = Buffer.alloc(16 + len + 8);
        dataBuffer.copy(finalBuffer, 0);
        
        // Escribir CRC
        finalBuffer.writeUInt32BE(crc, 16 + len);
        
        // Escribir tail
        finalBuffer.write(TUYA_TAIL, 16 + len + 4, 'hex');
        
        return finalBuffer;
    },
    
    /**
     * Construye un paquete para el protocolo Tuya v3.5 con cifrado
     * @param {string} payload - Payload en formato JSON 
     * @param {number} msgType - Tipo de mensaje (0x05, 0x10, etc.)
     * @param {string} deviceId - ID del dispositivo
     * @param {string} key - Clave para cifrado (localKey o sessionKey)
     * @param {boolean} isHandshake - Si es true, almacena el nonce como clientRandom
     * @returns {Buffer} - Paquete completo cifrado
     */
    buildV35Packet: function(payload, msgType, deviceId, key, isHandshake = false) {
        // Implementar la lógica de paquetes cifrados con AES-128-GCM según la especificación Tuya v3.5
        // Este es un placeholder - necesitaríamos la implementación real de TuyaEncryption
        
        // Crear los datos AAD (datos adicionales autenticados)
        const sequence = Buffer.from(generateRandomHexBytes(4), 'hex');
        
        // Construir encabezado
        const header = Buffer.from(TUYA_HEADER_V35, 'hex');
        
        // Cifrar payload y obtener tag
        // Esta parte debe ser implementada con TuyaEncryption
        const encrypted = {}; // placeholder
        
        // Construir el paquete completo
        const finalBuffer = Buffer.concat([
            header,
            // resto de los datos del paquete cifrado
            Buffer.from(TUYA_TAIL_V35, 'hex')
        ]);
        
        return finalBuffer;
    },
    
    /**
     * Parsea un paquete recibido del dispositivo Tuya
     * @param {Buffer} packet - Paquete completo
     * @param {string} key - Clave para descifrado (localKey o sessionKey)
     * @returns {Object} - Datos del paquete parseado
     */
    parsePacket: function(packet, key) {
        // Verificar el encabezado
        const headerHex = packet.slice(0, 4).toString('hex');
        
        // Determinar versión del protocolo por el encabezado
        const isV35 = headerHex === TUYA_HEADER_V35;
        
        if (isV35) {
            // Parsear paquete v3.5 (cifrado)
            // Implementar la lógica de descifrado
            return {
                version: '3.5',
                messageType: packet[8],
                // Otros campos parseados
            };
        } else if (headerHex === TUYA_HEADER) {
            // Parsear paquete v3.1
            return {
                version: '3.1',
                messageType: packet.readUInt32BE(8),
                dataLength: packet.readUInt32BE(12),
                data: packet.slice(16, 16 + packet.readUInt32BE(12)).toString(),
                // CRC y validación
            };
        } else {
            throw new Error('Unknown packet format');
        }
    },
    
    /**
     * Extrae el ID del dispositivo de un paquete
     * @param {Buffer} packet - Paquete recibido
     * @returns {string|null} ID del dispositivo o null si no se encuentra
     */
    parseDeviceId: function(packet) {
        try {
            const headerHex = packet.slice(0, 4).toString('hex');
            
            if (headerHex === TUYA_HEADER_V35) {
                // Para paquetes v3.5, extraer del payload descifrado
                // Esta es una implementación simplificada
                return null; // Placeholder
            } else if (headerHex === TUYA_HEADER) {
                // Para paquetes v3.1, extraer del JSON
                const data = packet.slice(16, 16 + packet.readUInt32BE(12)).toString();
                try {
                    const json = JSON.parse(data);
                    return json.gwId || json.devId;
                } catch (e) {
                    return null;
                }
            }
            return null;
        } catch (error) {
            console.error('Error parsing device ID:', error);
            return null;
        }
    },
    
    // Exportar constantes
    HEADER: TUYA_HEADER,
    HEADER_V35: TUYA_HEADER_V35,
    TAIL: TUYA_TAIL,
    TAIL_V35: TUYA_TAIL_V35,
    TYPES: MESSAGE_TYPES
};

module.exports = TuyaPacket;
