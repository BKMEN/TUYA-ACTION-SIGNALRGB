/**
 * Manejador de negociación de sesión para protocolo Tuya v3.5
 */

import EventEmitter from '../utils/EventEmitter.js';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import TuyaEncryption from '../utils/TuyaEncryption.js';
const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest();

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
            const socket = dgram.createSocket('udp4');
            this.socket = socket;

            const clientRandom = TuyaEncryption.generateRandomHexBytes(16);

            const payload = {
                uuid: this.generateUUID(),
                t: Math.floor(Date.now() / 1000),
                gwId: this.deviceId,
                random: clientRandom
            };

            const iv = crypto.randomBytes(12);
            const aad = TuyaEncryption.createAAD(0x05, Buffer.alloc(4), Buffer.byteLength(JSON.stringify(payload)));
            const enc = TuyaEncryption.encryptGCM(JSON.stringify(payload), UDP_KEY, iv, aad);
            const encPayload = Buffer.concat([iv, enc.ciphertext, enc.tag]);

            const packet = this.buildHandshakePacket(encPayload);

            const timeoutId = setTimeout(() => {
                this.emit('error', new Error('Session negotiation timeout'));
                this.cleanup();
                reject(new Error('Session negotiation timeout'));
            }, this.timeout);

            socket.on('error', (err) => {
                clearTimeout(timeoutId);
                this.emit('error', err);
                this.cleanup();
                reject(err);
            });

            socket.on('message', (msg, rinfo) => {
                if (rinfo.address !== this.ip) {
                    return;
                }

                try {
                    const response = this.parseHandshakeResponse(msg);
                    if (!response || !response.random) {
                        throw new Error('Invalid handshake response');
                    }

                    this.sessionKey = this.deriveSessionKey(clientRandom, response.random);

                    clearTimeout(timeoutId);
                    socket.close();
                    this.socket = null;

                    const result = {
                        sessionKey: this.sessionKey,
                        deviceId: this.deviceId,
                        ip: this.ip,
                        port: this.port
                    };

                    this.emit('success', result);
                    resolve(result);
                } catch (error) {
                    clearTimeout(timeoutId);
                    socket.close();
                    this.socket = null;
                    this.emit('error', error);
                    reject(error);
                }
            });

            socket.send(packet, 0, packet.length, this.port, this.ip, (err) => {
                if (err) {
                    clearTimeout(timeoutId);
                    this.emit('error', err);
                    this.cleanup();
                    reject(err);
                }
            });
        });
    }

    /**
     * Construye paquete de handshake
     */
    buildHandshakePacket(payload) {
        const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
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
     * Deriva la clave de sesión usando MD5 como en el protocolo oficial
     */
    deriveSessionKey(clientRandom, deviceRandom) {
        const input = Buffer.from(this.deviceKey + clientRandom + deviceRandom, 'hex');
        return crypto.createHash('md5').update(input).digest('hex');
    }

    /**
     * Parsea la respuesta del handshake
     */
    parseHandshakeResponse(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
            throw new Error('Invalid handshake packet');
        }

        const prefix = buffer.slice(0, 4).toString('hex');
        if (prefix !== '000055aa') {
            throw new Error('Invalid handshake prefix');
        }

        const command = buffer.readUInt32BE(8);
        if (command !== 0x06) {
            throw new Error('Unexpected handshake command');
        }

        const seq = buffer.slice(4, 8);
        const len = buffer.readUInt32BE(12);
        const payload = buffer.slice(16, 16 + len);

        const iv = payload.slice(0, 12);
        const tag = payload.slice(payload.length - 16);
        const ciphertext = payload.slice(12, payload.length - 16);
        const aad = TuyaEncryption.createAAD(0x06, seq, ciphertext.length);

        const decrypted = TuyaEncryption.decryptGCM(ciphertext, UDP_KEY, iv, tag, aad);
        if (!decrypted) {
            throw new Error('Handshake decryption failed');
        }

        try {
            return JSON.parse(decrypted.toString());
        } catch (err) {
            throw new Error('Failed to parse handshake payload');
        }
    }

    /**
     * Genera string hexadecimal aleatorio
     */
    generateRandomHex(length) {
        return crypto.randomBytes(length).toString('hex');
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

export default TuyaSessionNegotiator;

