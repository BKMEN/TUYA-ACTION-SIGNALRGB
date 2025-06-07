/**
 * Manejador de negociación de sesión para protocolo Tuya v3.5
 */

import EventEmitter from '../utils/EventEmitter.js';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import TuyaEncryption from './TuyaEncryption.js';
import TuyaEncryptor from './TuyaEncryptor.js';
import TuyaNegotiationMessage from './TuyaNegotiationMessage.js';
import TuyaMessage from './TuyaMessage.js';

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest('hex');

class TuyaSessionNegotiator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.deviceId = options.deviceId;
        this.deviceKey = options.deviceKey;
        this.ip = options.ip;
        this.port = options.port || 6668;
        this.timeout = options.timeout || 10000;
        this.maxRetries = options.maxRetries || 3;
        this.retryInterval = options.retryInterval || 5000;
        this.debugMode = options.debugMode || false;

        this.sessionKey = null;
        this.sequenceNumber = 0;
        this.socket = null;
        this.isNegotiating = false;
        this.lastAttempt = 0;
        this.retryCount = 0;
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
            this._lastRandom = clientRandom;
            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log(`Negotiator ${this.deviceId} random:`, clientRandom);
            }

            const payload = {
                uuid: this.generateUUID(),
                t: Math.floor(Date.now() / 1000),
                gwId: this.deviceId,
                random: clientRandom
            };

            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log(`Negotiator ${this.deviceId} UUID:`, payload.uuid);
            }

            const iv = crypto.randomBytes(12).toString('hex');
            const aad = TuyaEncryption.createAAD(0x05, Buffer.alloc(4), Buffer.byteLength(JSON.stringify(payload)));
            const enc = TuyaEncryptor.encrypt(JSON.stringify(payload), UDP_KEY, iv, aad);
            const encPayload = Buffer.concat([Buffer.from(iv,'hex'), enc.ciphertext, enc.tag]);

            const packet = this.buildHandshakePacket(encPayload);

            const parsed = TuyaMessage.parse(packet);
            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log('Handshake CRC', parsed.crc.toString(16), 'calc', parsed.calcCrc.toString(16));
            }

            const timeoutId = setTimeout(() => {
                this.emit('error', new Error('Session negotiation timeout'));
                this.cleanup();
                reject(new Error('Session negotiation timeout'));
            }, this.timeout);

            let retries = 0;
            const retryTimer = setInterval(() => {
                if (this.sessionKey) {
                    clearInterval(retryTimer);
                    return;
                }
                if (retries >= this.maxRetries) {
                    clearInterval(retryTimer);
                    return;
                }
                retries++;
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    log(`Negotiator retry ${retries} for ${this.deviceId}`);
                }
                socket.send(packet, 0, packet.length, this.port, this.ip);
            }, 2000);

            socket.on('error', (err) => {
                clearInterval(retryTimer);
                clearTimeout(timeoutId);
                this.emit('error', err);
                this.cleanup();
                reject(err);
            });

            socket.on('message', (msg, rinfo) => {
                if (rinfo.address !== this.ip) {
                    return;
                }
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    log('Handshake response raw:', msg.toString('hex'));
                }

                try {
                    const response = this.parseHandshakeResponse(msg);
                    if (!response || !response.sessionKey) {
                        throw new Error('Invalid handshake response');
                    }

                    this.sessionKey = response.sessionKey;
                    
                    clearInterval(retryTimer);
                    clearTimeout(timeoutId);
                    socket.close();
                    this.socket = null;
                    this.retryCount = 0;

                    if (service && service.debug) service.debug('Negotiator session established');
                    const result = {
                        sessionKey: this.sessionKey,
                        deviceId: this.deviceId,
                        ip: this.ip,
                        port: this.port
                    };

                    this.emit('success', result);
                    resolve(result);
                } catch (error) {
                    clearInterval(retryTimer);
                    clearTimeout(timeoutId);
                    socket.close();
                    this.socket = null;
                    if (service && service.error) service.error('Negotiation error: ' + error.message);
                    this.emit('error', error);
                    reject(error);
                }
            });

            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log('Sending handshake packet:', packet.toString('hex'));
            }
            socket.send(packet, 0, packet.length, this.port, this.ip, (err) => {
                if (err) {
                    clearInterval(retryTimer);
                    clearTimeout(timeoutId);
                    if (service && service.error) service.error('Send error: ' + err.message);
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
        const packet = TuyaMessage.build(
            '000055aa',
            ++this.sequenceNumber,
            0x05,
            payload
        );
        if (service && service.debug) {
            const parsed = TuyaMessage.parse(packet);
            service.debug('Handshake packet CRC', parsed.crc.toString(16), 'calc', parsed.calcCrc.toString(16));
        }
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
        const msg = TuyaMessage.parse(buffer);
        if (!msg.crcValid) throw new Error('Invalid CRC in handshake');
        if (msg.cmd !== 0x09) throw new Error('Unexpected command');
        const iv = msg.payload.slice(0, 12);
        const tag = msg.payload.slice(msg.payload.length - 16);
        const ciphertext = msg.payload.slice(12, msg.payload.length - 16);
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(msg.seq);
        const aad = TuyaEncryption.createAAD(0x09, seqBuf, ciphertext.length);
        const decrypted = TuyaEncryptor.decrypt(ciphertext, UDP_KEY, iv.toString('hex'), tag, aad);
        if (!decrypted) throw new Error('Failed to decrypt handshake');
        const data = JSON.parse(decrypted.toString());
        const deviceRandom = data.random || data.rnd || '';
        const sessionKey = TuyaEncryption.deriveSessionKey(this.deviceKey, this._lastRandom, deviceRandom);
        if ((service && service.debug) || this.debugMode) {
            const log = service && service.debug ? service.debug.bind(service) : console.debug;
            log('Negotiator sessionKey', sessionKey);
        }
        return { ...data, sessionKey };
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
     * Alias de compatibilidad para iniciar la negociación
     */
    start() {
        return this.negotiateSession();
    }

    handleQueue(now = Date.now()) {
        if (this.sessionKey) return;
        if (this.isNegotiating) return;
        if (now - this.lastAttempt < this.retryInterval) return;
        if (this.retryCount >= this.maxRetries) return;
        this.retryCount++;
        this.lastAttempt = now;
        if (service && service.debug) service.debug('Negotiator retry', this.retryCount);
        this.negotiateSession().catch(() => {});
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
        this._lastRandom = null;
    }
}

export default TuyaSessionNegotiator;

