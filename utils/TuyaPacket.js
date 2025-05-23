// utils/TuyaPacket.js
/**
 * Utilidad para analizar, crear y validar paquetes del protocolo Tuya
 * Implementa funciones para manipular los paquetes binarios según
 * la especificación del protocolo Tuya v3.3
 * 
 * @author BKMEN
 * @version 1.0.0
 */

// ELIMINAR cualquier require problemático

class TuyaPacket {
    // Constantes del protocolo Tuya
    static PREFIX = '000055aa';
    static SUFFIX = '0000aa55';
    
    // Constantes para protocolo v3.5
    static PREFIX_V35 = '00006699';
    static SUFFIX_V35 = '00009966';
    
    // Tipos de comandos
    static TYPES = {
        CONTROL_NEW: 0x07,
        SESS_KEY_NEG_REQ: 0x05,
        SESS_KEY_NEG_RESP: 0x06,
        SESS_KEY_CMD: 0x08,
        STATUS: 0x08,
        HEART_BEAT: 0x09,
        DP_QUERY: 0x0A
    };

    /**
     * Construye un paquete v3.1
     */
    static buildV31Packet(payload, commandType, key) {
        try {
            const payloadBuffer = Buffer.from(payload, 'utf8');
            const headerSize = 16;
            const packetSize = headerSize + payloadBuffer.length + 8;
            
            const packet = Buffer.alloc(packetSize);
            
            // Prefijo
            packet.write(this.PREFIX, 0, 4, 'hex');
            
            // Secuencia (usar timestamp)
            packet.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
            
            // Comando
            packet.writeUInt32BE(commandType, 8);
            
            // Longitud
            packet.writeUInt32BE(payloadBuffer.length, 12);
            
            // Payload
            payloadBuffer.copy(packet, 16);
            
            // CRC
            const crc = this.calculateCRC(packet.slice(0, 16 + payloadBuffer.length));
            packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
            
            // Sufijo
            packet.write(this.SUFFIX, 16 + payloadBuffer.length + 4, 4, 'hex');
            
            return packet;
        } catch (error) {
            throw new Error(`Error building v3.1 packet: ${error.message}`);
        }
    }

    /**
     * Construye un paquete v3.5
     */
    static buildV35Packet(payload, commandType, deviceId, key, isHandshake = false) {
        try {
            const payloadBuffer = Buffer.from(payload, 'utf8');
            const headerSize = 16;
            const packetSize = headerSize + payloadBuffer.length + 8;
            
            const packet = Buffer.alloc(packetSize);
            
            // Prefijo v3.5
            packet.write(this.PREFIX_V35, 0, 4, 'hex');
            
            // Secuencia
            packet.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
            
            // Comando
            packet.writeUInt32BE(commandType, 8);
            
            // Longitud
            packet.writeUInt32BE(payloadBuffer.length, 12);
            
            // Payload
            payloadBuffer.copy(packet, 16);
            
            // CRC
            const crc = this.calculateCRC(packet.slice(0, 16 + payloadBuffer.length));
            packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
            
            // Sufijo v3.5
            packet.write(this.SUFFIX_V35, 16 + payloadBuffer.length + 4, 4, 'hex');
            
            return packet;
        } catch (error) {
            throw new Error(`Error building v3.5 packet: ${error.message}`);
        }
    }

    /**
     * Parsea un paquete recibido
     */
    static parsePacket(buffer, key) {
        try {
            if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
                throw new Error('Invalid packet: too short');
            }

            // Verificar prefijo
            const prefix = buffer.slice(0, 4).toString('hex');
            if (prefix !== this.PREFIX.substring(2) && prefix !== this.PREFIX_V35.substring(2)) {
                throw new Error('Invalid packet: wrong prefix');
            }

            // Extraer campos del header
            const sequence = buffer.readUInt32BE(4);
            const command = buffer.readUInt32BE(8);
            const length = buffer.readUInt32BE(12);

            // Extraer payload
            let payload = null;
            if (length > 0 && buffer.length >= 16 + length) {
                const payloadBuffer = buffer.slice(16, 16 + length);
                try {
                    payload = JSON.parse(payloadBuffer.toString('utf8'));
                } catch (e) {
                    payload = payloadBuffer.toString('utf8');
                }
            }

            return {
                sequence: sequence,
                command: command,
                messageType: this.getMessageTypeName(command),
                length: length,
                data: payload,
                isValid: true
            };
        } catch (error) {
            return {
                sequence: 0,
                command: 0,
                messageType: 'unknown',
                length: 0,
                data: null,
                isValid: false,
                error: error.message
            };
        }
    }

    /**
     * Obtiene el nombre del tipo de mensaje
     */
    static getMessageTypeName(command) {
        switch (command) {
            case this.TYPES.CONTROL_NEW: return 'CONTROL_NEW';
            case this.TYPES.SESS_KEY_NEG_REQ: return 'SESS_KEY_NEG_REQ';
            case this.TYPES.SESS_KEY_NEG_RESP: return 'SESS_KEY_NEG_RESP';
            case this.TYPES.SESS_KEY_CMD: return 'SESS_KEY_CMD';
            case this.TYPES.STATUS: return 'STATUS';
            case this.TYPES.HEART_BEAT: return 'HEART_BEAT';
            case this.TYPES.DP_QUERY: return 'DP_QUERY';
            default: return 'UNKNOWN';
        }
    }

    /**
     * Calcula CRC simple
     */
    static calculateCRC(buffer) {
        let crc = 0;
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc + buffer[i]) & 0xFFFFFFFF;
        }
        return crc;
    }

    /**
     * Valida la estructura de un paquete
     */
    static validatePacket(buffer) {
        if (!Buffer.isBuffer(buffer)) {
            return { isValid: false, error: 'Not a buffer' };
        }

        if (buffer.length < 20) {
            return { isValid: false, error: 'Packet too short' };
        }

        const prefix = buffer.slice(0, 4).toString('hex');
        if (prefix !== this.PREFIX.substring(2) && prefix !== this.PREFIX_V35.substring(2)) {
            return { isValid: false, error: 'Invalid prefix' };
        }

        const suffix = buffer.slice(-4).toString('hex');
        if (suffix !== this.SUFFIX.substring(2) && suffix !== this.SUFFIX_V35.substring(2)) {
            return { isValid: false, error: 'Invalid suffix' };
        }

        return { isValid: true, error: null };
    }

    /**
     * Crea un paquete de heartbeat
     */
    static createHeartbeatPacket() {
        return this.buildV31Packet('', this.TYPES.HEART_BEAT, '');
    }

    /**
     * Crea un paquete de consulta de estado
     */
    static createStatusQueryPacket(deviceId, key) {
        const payload = JSON.stringify({
            gwId: deviceId,
            devId: deviceId,
            uid: '',
            t: Math.floor(Date.now() / 1000)
        });

        return this.buildV31Packet(payload, this.TYPES.DP_QUERY, key);
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