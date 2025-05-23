/**
 * Manejador de negociación de sesión para protocolo Tuya v3.5
 */

import udp from "@SignalRGB/udp";
const EventEmitter = require('../utils/EventEmitter.js');
const CryptoJS = require('../Crypto/lib/core.js');
const MD5 = require('../Crypto/lib/md5.js');

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
    }

    /**
     * Inicia negociación de sesión
     */
    async negotiateSession() {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.cleanup();
                reject(new Error('Session negotiation timeout'));
            }, this.timeout);

            try {
                // Crear socket UDP
                this.socket = udp.createSocket('udp4');
                
                this.socket.on('message', (msg, rinfo) => {
                    try {
                        const result = this.handleSessionResponse(msg, rinfo);
                        if (result) {
                            clearTimeout(timeoutId);
                            this.cleanup();
                            resolve(result);
                        }
                    } catch (error) {
                        clearTimeout(timeoutId);
                        this.cleanup();
                        reject(error);
                    }
                });

                this.socket.on('error', (error) => {
                    clearTimeout(timeoutId);
                    this.cleanup();
                    reject(error);
                });

                // Enviar solicitud de handshake
                this.sendHandshakeRequest();

            } catch (error) {
                clearTimeout(timeoutId);
                this.cleanup();
                reject(error);
            }
        });
    }

    /**
     * Envía solicitud de handshake
     */
    sendHandshakeRequest() {
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
        
        // Enviar paquete
        this.socket.send(packet, this.port, this.ip, (error) => {
            if (error) {
                this.emit('error', error);
            }
        });

        // Guardar random para derivar clave
        this.clientRandom = clientRandom;
    }

    /**
     * Maneja respuesta de sesión
     */
    handleSessionResponse(message, rinfo) {
        try {
            // Parsear respuesta
            const response = this.parseSessionResponse(message);
            if (!response) {
                return null;
            }

            // Derivar clave de sesión
            if (response.random && this.clientRandom) {
                this.sessionKey = this.deriveSessionKey(
                    this.clientRandom,
                    response.random
                );

                return {
                    sessionKey: this.sessionKey,
                    deviceId: this.deviceId,
                    ip: rinfo.address,
                    port: rinfo.port
                };
            }

            return null;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Parsea respuesta de sesión
     */
    parseSessionResponse(message) {
        try {
            // Verificar que es un paquete Tuya válido
            if (message.length < 20) {
                return null;
            }

            const prefix = message.slice(0, 4).toString('hex');
            if (prefix !== '000055aa') {
                return null;
            }

            // Extraer datos
            const dataLength = message.readUInt32BE(12);
            const data = message.slice(16, 16 + dataLength);
            
            // Intentar parsear como JSON
            const jsonStr = data.toString('utf8');
            return JSON.parse(jsonStr);

        } catch (error) {
            return null;
        }
    }

    /**
     * Construye paquete de handshake
     */
    buildHandshakePacket(payload) {
        const payloadBuffer = Buffer.from(payload, 'utf8');
        const headerSize = 16;
        const packetSize = headerSize + payloadBuffer.length + 8; // +8 para CRC y sufijo
        
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
        
        // Calcular CRC (implementación simplificada)
        const crc = this.calculateSimpleCRC(packet.slice(0, 16 + payloadBuffer.length));
        packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
        
        // Escribir sufijo
        packet.write('0000aa55', 16 + payloadBuffer.length + 4, 4, 'hex');
        
        return packet;
    }

    /**
     * Deriva clave de sesión usando MD5
     */
    deriveSessionKey(clientRandom, deviceRandom) {
        const input = this.deviceKey + clientRandom + deviceRandom;
        
        // Usar implementación MD5 de CryptoJS
        const hash = MD5.MD5(input);
        return hash.toString(CryptoJS.enc.Hex);
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
    }
}

module.exports = TuyaSessionNegotiator;

// Para compatibilidad con ES6
if (typeof exports !== 'undefined') {
    exports.default = TuyaSessionNegotiator;
}
