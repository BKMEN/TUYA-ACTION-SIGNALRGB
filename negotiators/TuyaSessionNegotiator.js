/**
 * Manejador de negociación de sesión para protocolo Tuya v3.5
 */

// ELIMINAR imports problemáticos y usar solo los compatibles
const EventEmitter = require('../utils/EventEmitter.js');

class TuyaSessionNegotiator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.deviceId = options.deviceId;
        this.deviceKey = options.deviceKey;
        this.ip = options.ip;
        this.port = options.port || 6668;
        this.timeout = options.timeout || 10000;
        
        this.sessionKey = null;
        this.sequenceNumber = 0;
        this.socket = null;
        this.isNegotiating = false;
    }

    /**
     * Inicia negociación de sesión
     */
    async negotiateSession() {
        if (this.isNegotiating) {
            throw new Error('Negotiation already in progress');
        }

        this.isNegotiating = true;

        try {
            return await this._performNegotiation();
        } finally {
            this.isNegotiating = false;
        }
    }

    /**
     * Realiza la negociación
     */
    _performNegotiation() {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.cleanup();
                reject(new Error('Session negotiation timeout'));
            }, this.timeout);

            try {
                // Generar random del cliente
                const clientRandom = this.generateRandomHex(16);
                
                // Crear payload de handshake
                const payload = {
                    uuid: this.generateUUID(),
                    t: Math.floor(Date.now() / 1000),
                    gwId: this.deviceId,
                    random: clientRandom
                };

                // Construir paquete
                const packet = this.buildHandshakePacket(JSON.stringify(payload));
                
                // Simular envío (en implementación real usaría UDP)
                setTimeout(() => {
                    // Simular respuesta exitosa
                    const mockResponse = {
                        random: this.generateRandomHex(16),
                        success: true
                    };

                    try {
                        this.sessionKey = this.deriveSessionKey(
                            clientRandom,
                            mockResponse.random
                        );

                        clearTimeout(timeoutId);
                        this.cleanup();
                        
                        resolve({
                            sessionKey: this.sessionKey,
                            deviceId: this.deviceId,
                            ip: this.ip,
                            port: this.port
                        });
                    } catch (error) {
                        clearTimeout(timeoutId);
                        this.cleanup();
                        reject(error);
                    }
                }, 100); // Simular delay de red

            } catch (error) {
                clearTimeout(timeoutId);
                this.cleanup();
                reject(error);
            }
        });
    }

    /**
     * Construye paquete de handshake
     */
    buildHandshakePacket(payload) {
        const payloadBuffer = Buffer.from(payload, 'utf8');
        const headerSize = 16;
        const packetSize = headerSize + payloadBuffer.length + 8;
        
        const packet = Buffer.alloc(packetSize);
        
        // Escribir prefijo
        packet.write('000055aa', 0, 4, 'hex');
        
        // Escribir secuencia
        packet.writeUInt32BE(++this.sequenceNumber, 4);
        
        // Escribir comando (0x05 para handshake)
        packet.writeUInt32BE(0x05, 8);
        
        // Escribir longitud
        packet.writeUInt32BE(payloadBuffer.length, 12);
        
        // Copiar payload
        payloadBuffer.copy(packet, 16);
        
        // Calcular CRC
        const crc = this.calculateSimpleCRC(packet.slice(0, 16 + payloadBuffer.length));
        packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
        
        // Escribir sufijo
        packet.write('0000aa55', 16 + payloadBuffer.length + 4, 4, 'hex');
        
        return packet;
    }

    /**
     * Deriva clave de sesión usando hash simple
     */
    deriveSessionKey(clientRandom, deviceRandom) {
        const input = this.deviceKey + clientRandom + deviceRandom;
        return this.calculateHash(input);
    }

    /**
     * Calcula hash simple
     */
    calculateHash(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
    }

    /**
     * Genera string hexadecimal aleatorio
     */
    generateRandomHex(length) {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length * 2; i++) {
            result += chars[Math.floor(Math.random() * 16)];
        }
        return result;
    }

    /**
     * Genera UUID simple
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Calcula CRC simple
     */
    calculateSimpleCRC(buffer) {
        let crc = 0;
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc + buffer[i]) & 0xFFFFFFFF;
        }
        return crc;
    }

    /**
     * Limpia recursos
     */
    cleanup() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (error) {
                // Ignorar errores al cerrar
            }
            this.socket = null;
        }
        this.isNegotiating = false;
    }
}

module.exports = TuyaSessionNegotiator;
