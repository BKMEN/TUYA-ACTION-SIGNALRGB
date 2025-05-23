// utils/TuyaPacket.js
/**
 * Utilidad para analizar, crear y validar paquetes del protocolo Tuya
 * Implementa funciones para manipular los paquetes binarios según
 * la especificación del protocolo Tuya v3.3
 * 
 * @author BKMEN
 * @version 1.0.0
 */

const crypto = require('crypto');

class TuyaPacket {
    // Constantes del protocolo Tuya
    static PREFIX = '000055aa';
    static SUFFIX = '0000aa55';
    
    // Comandos conocidos del protocolo
    static COMMANDS = {
        UDP_NEW: '0000000a',        // Nuevo formato UDP
        DISCOVERY: '00000007',      // Solicitud/respuesta de descubrimiento
        CONTROL: '00000007',        // Comando para control de dispositivo
        STATUS: '00000008',         // Comando para obtener estado
        HEART_BEAT: '0000000a',     // Comando para heartbeat
        DP_QUERY: '0000000a',       // Consulta de datapoints
        WIFI_RESET: '00000011',     // Reset de configuración WiFi
        WIFI_CONF: '00000012',      // Configuración WiFi
        TOKEN_BINDING: '00000013',  // Obtener token de enlace
        CONTROL_NEW: '0000001a',    // Comandos en el nuevo protocolo
        QUERYSTATUS: '00000024'     // Consulta de estado
    };

    // Versiones conocidas del protocolo
    static PROTOCOL_VERSIONS = {
        V33: 0x33,                  // Versión 3.3
        V34: 0x34,                  // Versión 3.4
        V31: 0x31                   // Versión 3.1 (antigua)
    };

    /**
     * Verifica si un buffer es un paquete Tuya válido
     * @param {Buffer} buffer - Buffer a verificar
     * @returns {boolean} - true si es un paquete Tuya válido
     */
    static isValidPacket(buffer) {
        // Verificación mínima: prefijo correcto y longitud suficiente
        if (buffer.length < 16) return false;
        
        const prefix = buffer.slice(0, 4).toString('hex');
        return prefix === TuyaPacket.PREFIX;
    }

    /**
     * Parsea un buffer a un objeto de paquete Tuya
     * @param {Buffer} buffer - Buffer del paquete a analizar
     * @returns {Object|null} - Objeto con la información del paquete o null si no es válido
     */
    static parse(buffer) {
        if (!TuyaPacket.isValidPacket(buffer)) {
            return null;
        }

        try {
            // Extraer los componentes del paquete
            const prefix = buffer.slice(0, 4).toString('hex');
            const seqNumber = buffer.readUInt32BE(4);
            const command = buffer.readUInt32BE(8).toString(16).padStart(8, '0');
            const dataLength = buffer.readUInt32BE(12);
            
            // Calcular longitud total esperada (cabecera + datos + CRC + sufijo)
            const expectedLength = 16 + dataLength + 4 + 4;
            
            // Verificar longitud suficiente
            if (buffer.length < expectedLength) {
                return {
                    valid: false,
                    error: 'Incomplete packet',
                    prefix,
                    seqNumber,
                    command,
                    dataLength,
                    expectedLength,
                    actualLength: buffer.length
                };
            }
            
            // Extraer datos y sufijo
            const data = buffer.slice(16, 16 + dataLength);
            const crc = buffer.readUInt32BE(16 + dataLength);
            const suffix = buffer.slice(16 + dataLength + 4, 16 + dataLength + 8).toString('hex');
            
            // Verificar CRC si la longitud es suficiente
            const calculatedCRC = TuyaPacket.calculateCRC(buffer.slice(0, 16 + dataLength));
            const crcValid = (crc === calculatedCRC);
            
            // Extraer información adicional basada en el comando
            let commandName = 'UNKNOWN';
            for (const [name, value] of Object.entries(TuyaPacket.COMMANDS)) {
                if (value === command) {
                    commandName = name;
                    break;
                }
            }
            
            // Parsear el payload según el tipo de comando
            let parsedData = null;
            try {
                // Para algunos comandos intentamos parsear JSON
                if (data.length > 0) {
                    // Intentar decodificar como UTF-8, ignorar errores
                    const dataStr = data.toString('utf8', 0, data.length);
                    
                    // Ver si parece JSON
                    if (dataStr.startsWith('{') && dataStr.endsWith('}')) {
                        try {
                            parsedData = JSON.parse(dataStr);
                        } catch (e) {
                            // No es JSON válido, usar los bytes crudos
                            parsedData = data;
                        }
                    } else {
                        // No parece JSON, usar los bytes crudos
                        parsedData = data;
                    }
                }
            } catch (e) {
                // Error al parsear, usar datos crudos
                parsedData = data;
            }
            
            // Armar objeto resultante
            return {
                valid: suffix === TuyaPacket.SUFFIX && crcValid,
                prefix,
                seqNumber,
                command,
                commandName,
                dataLength,
                data: parsedData || data,
                rawData: data.toString('hex'),
                crc,
                calculatedCRC,
                crcValid,
                suffix,
                suffixValid: suffix === TuyaPacket.SUFFIX,
                buffer: buffer,
                timestamp: Date.now()
            };
        } catch (err) {
            return {
                valid: false,
                error: `Error parsing packet: ${err.message}`,
                rawBuffer: buffer.toString('hex')
            };
        }
    }

    /**
     * Crea un paquete Tuya para enviar al dispositivo
     * @param {Object} options - Opciones para crear el paquete
     * @param {number} options.command - Comando a enviar (usar TuyaPacket.COMMANDS)
     * @param {Buffer|Object|string} [options.data=null] - Datos a enviar
     * @param {number} [options.seqNumber=0] - Número de secuencia
     * @param {number} [options.protocolVersion=TuyaPacket.PROTOCOL_VERSIONS.V33] - Versión del protocolo
     * @returns {Buffer} - Buffer con el paquete completo
     */
    static create(options) {
        const { 
            command, 
            data = null, 
            seqNumber = 0,
            protocolVersion = TuyaPacket.PROTOCOL_VERSIONS.V33
        } = options;
        
        // Convertir comando a entero si es string
        const cmdValue = typeof command === 'string' ? 
                        parseInt(command, 16) : command;
        
        // Preparar los datos
        let dataBuffer = null;
        
        if (data === null) {
            dataBuffer = Buffer.alloc(0);
        } else if (Buffer.isBuffer(data)) {
            dataBuffer = data;
        } else if (typeof data === 'object') {
            // Convertir objetos a JSON string y luego a buffer
            dataBuffer = Buffer.from(JSON.stringify(data), 'utf8');
        } else if (typeof data === 'string') {
            // Si es un string hexadecimal
            if (/^[0-9A-Fa-f]+$/.test(data)) {
                dataBuffer = Buffer.from(data, 'hex');
            } else {
                // String normal
                dataBuffer = Buffer.from(data, 'utf8');
            }
        } else {
            throw new Error('Invalid data type for packet creation');
        }
        
        // Calcular longitud total del paquete
        const dataLength = dataBuffer.length;
        
        // Crear buffer para el paquete completo
        // prefijo(4) + seq(4) + cmd(4) + len(4) + data(n) + crc(4) + sufijo(4)
        const buffer = Buffer.alloc(16 + dataLength + 8);
        
        // Escribir prefijo
        buffer.write(TuyaPacket.PREFIX, 0, 4, 'hex');
        
        // Escribir numero de secuencia
        buffer.writeUInt32BE(seqNumber, 4);
        
        // Escribir comando
        buffer.writeUInt32BE(cmdValue, 8);
        
        // Escribir longitud de datos
        buffer.writeUInt32BE(dataLength, 12);
        
        // Copiar datos
        if (dataLength > 0) {
            dataBuffer.copy(buffer, 16);
        }
        
        // Calcular CRC
        const crc = TuyaPacket.calculateCRC(buffer.slice(0, 16 + dataLength));
        
        // Escribir CRC
        buffer.writeUInt32BE(crc, 16 + dataLength);
        
        // Escribir sufijo
        buffer.write(TuyaPacket.SUFFIX, 16 + dataLength + 4, 4, 'hex');
        
        return buffer;
    }
    
    /**
     * Calcula el CRC de un buffer según el algoritmo Tuya
     * @param {Buffer} buffer - Buffer para calcular CRC
     * @returns {number} - Valor CRC calculado
     */
    static calculateCRC(buffer) {
        // CORREGIDO: CRC32 estándar bit a bit
        let crc = 0xFFFFFFFF;
        
        for (let i = 0; i < buffer.length; i++) {
            crc = crc ^ buffer[i];
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
    
    /**
     * Crea un paquete de descubrimiento para broadcast
     * @param {number} [seqNumber=1] - Número de secuencia
     * @returns {Buffer} - Paquete de descubrimiento
     */
    static createDiscoveryPacket(seqNumber = 1) {
        return TuyaPacket.create({
            command: parseInt(TuyaPacket.COMMANDS.DISCOVERY, 16),
            seqNumber: seqNumber,
            data: Buffer.from([0x01]) // Descubrimiento con payload 0x01
        });
    }
    
    /**
     * Crea un paquete para control de un datapoint específico
     * @param {Object} options - Opciones para el comando
     * @param {number} options.dps - Datapoint a modificar
     * @param {*} options.value - Valor a establecer
     * @param {number} [options.seqNumber=1] - Número de secuencia
     * @returns {Buffer} - Paquete de control
     */
    static createControlPacket(options) {
        const { dps, value, seqNumber = 1 } = options;
        
        // Crear objeto de control según formato Tuya
        const controlData = {
            devId: "", // Se rellena en el controlador
            dps: {
                [dps]: value
            }
        };
        
        return TuyaPacket.create({
            command: parseInt(TuyaPacket.COMMANDS.CONTROL, 16),
            seqNumber: seqNumber,
            data: controlData
        });
    }
    
    /**
     * Crea un paquete para obtener el estado del dispositivo
     * @param {number} [seqNumber=1] - Número de secuencia
     * @returns {Buffer} - Paquete de consulta
     */
    static createStatusPacket(seqNumber = 1) {
        return TuyaPacket.create({
            command: parseInt(TuyaPacket.COMMANDS.STATUS, 16),
            seqNumber: seqNumber
        });
    }
    
    /**
     * Convierte un buffer a representación hexadecimal legible
     * @param {Buffer} buffer - Buffer a convertir
     * @returns {string} - Representación hexadecimal del buffer
     */
    static bufferToHexString(buffer) {
        const hexLines = [];
        const bytesPerLine = 16;
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const chunk = buffer.slice(i, i + bytesPerLine);
            const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
            
            const addr = i.toString(16).padStart(6, '0');
            const paddedHex = hex.padEnd(bytesPerLine * 3 - 1, ' ');
            
            hexLines.push(`${addr}:  ${paddedHex}  |${ascii}|`);
        }
        
        return hexLines.join('\n');
    }
}

module.exports = TuyaPacket;

/* EJEMPLO DE USO:

const TuyaPacket = require('./utils/TuyaPacket.js');

// Ejemplo 1: Crear un paquete de descubrimiento
const discoveryPacket = TuyaPacket.createDiscoveryPacket();
console.log('Paquete de descubrimiento:');
console.log(TuyaPacket.bufferToHexString(discoveryPacket));

// Ejemplo 2: Parsear una respuesta
const responseBuffer = getResponseFromDevice(); // Función hipotética
const parsedPacket = TuyaPacket.parse(responseBuffer);
if (parsedPacket && parsedPacket.valid) {
    console.log('Comando:', parsedPacket.commandName);
    console.log('Datos:', parsedPacket.data);
} else {
    console.log('Paquete inválido:', parsedPacket.error);
}

// Ejemplo 3: Crear un paquete de control para encender una luz
const controlPacket = TuyaPacket.createControlPacket({
    dps: 1,  // Datapoint 1 suele controlar encendido/apagado
    value: true // true = encendido
});
console.log('Paquete de control:');
console.log(TuyaPacket.bufferToHexString(controlPacket));

*/