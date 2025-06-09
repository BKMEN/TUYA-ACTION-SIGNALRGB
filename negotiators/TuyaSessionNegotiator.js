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
import TuyaGCMParser from './TuyaGCMParser.js';
import gcmBuffer from './GCMBuffer.js';
import SessionCache from './SessionCache.js';

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest('hex');

class TuyaSessionNegotiator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.deviceId = options.deviceId;
        this.deviceKey = options.deviceKey;
        this.ip = options.ip;
        // Handshake siempre se envía al puerto 6668, ignorando el valor recibido
        this.port = 6668;
        this.timeout = options.timeout || 10000;
        this.maxRetries = options.maxRetries || 3;
        this.retryInterval = options.retryInterval || 5000;
        this.debugMode = options.debugMode || false;
        this.gcmBuffer = options.gcmBuffer || gcmBuffer;

        this.sessionKey = null;
        this.sessionIV = null;
        this.deviceRandom = null;
        this.sequenceNumber = 0;
        this.socket = null;
        this.isNegotiating = false;
        this.lastAttempt = 0;
        this.retryCount = 0;
        this.lastErrorTime = 0;
        this._sessionEstablished = false;
        this._negotiationTimeout = null;
        this._retryTimer = null;
        this._uuid = null;
    }

    /**
     * Inicia negociación de sesión
     */
    async negotiateSession() {
        if (this.isNegotiating) {
            throw new Error('Negotiation already in progress');
        }

        if (this.sessionKey || this._sessionEstablished) {
            return Promise.resolve({
                sessionKey: this.sessionKey,
                sessionIV: this.sessionIV,
                deviceRandom: this.deviceRandom,
                deviceId: this.deviceId,
                ip: this.ip,
                port: this.port
            });
        }

        const cached = SessionCache.get(this.deviceId);
        if (cached) {
            this.sessionKey = cached.sessionKey;
            this.sessionIV = cached.sessionIV;
            this.deviceRandom = cached.deviceRandom;
            this._sessionEstablished = true;
            return Promise.resolve({
                sessionKey: this.sessionKey,
                sessionIV: this.sessionIV,
                deviceRandom: this.deviceRandom,
                deviceId: this.deviceId,
                ip: this.ip,
                port: this.port
            });
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
        this._sessionEstablished = false;
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let settled = false;
            let socket;
            let onMessage;
            const done = (err, result) => {
                if (settled) return;
                settled = true;
                if (socket && onMessage) {
                    socket.removeListener('message', onMessage);
                }
                if (err) {
                    if (service && typeof service.log === 'function') {
                        service.log(`❌ No se pudo negociar sesión con ${this.deviceId} (${this.ip})`);
                    }
                    if (this._retryTimer) {
                        clearInterval(this._retryTimer);
                        this._retryTimer = null;
                    }
                    if (this._negotiationTimeout) {
                        clearTimeout(this._negotiationTimeout);
                        this._negotiationTimeout = null;
                    }
                    this.emit('error', err);
                    this.cleanup();
                    reject(err);
                } else {
                    if (this._retryTimer) {
                        clearInterval(this._retryTimer);
                        this._retryTimer = null;
                    }
                    if (this._negotiationTimeout) {
                        clearTimeout(this._negotiationTimeout);
                        this._negotiationTimeout = null;
                    }
                    this.emit('success', result);
                    resolve(result);
                }
            };

            const cached = this.gcmBuffer.get(this.ip);
            if (cached) {
                try {
                    const res = this.parseHandshakeResponse(cached);
                    if (res && res.sessionKey) {
                        this.sessionKey = res.sessionKey;
                        this.sessionIV = res.sessionIV;
                        this.deviceRandom = res.deviceRandom;
                        SessionCache.set(this.deviceId, {
                            sessionKey: this.sessionKey,
                            sessionIV: this.sessionIV,
                            deviceRandom: this.deviceRandom
                        });
                        this._sessionEstablished = true;
                        this.retryCount = 0;
                        done(null, {
                            sessionKey: this.sessionKey,
                            sessionIV: this.sessionIV,
                            deviceRandom: this.deviceRandom,
                            deviceId: this.deviceId,
                            ip: this.ip,
                            port: this.port
                        });
                        return;
                    }
                } catch (e) {
                    // ignore cached packet errors
                }
            }

            socket = dgram.createSocket('udp4');
            this.socket = socket;

            const clientRandom = TuyaEncryption.generateRandomHexBytes(16);
            this._lastRandom = clientRandom;
            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log(`Negotiator ${this.deviceId} random:`, clientRandom);
            }

            this._uuid = this.generateUUID();
            const payload = {
                uuid: this._uuid,
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

            if (typeof service !== 'undefined') {
                service.log(`🔑 Device ID: ${this.deviceId}`);
                service.log(`🔑 Token: ${this.deviceKey}`);
                service.log(`🔑 UUID: ${payload.uuid}`);
                service.log(`🔑 RND: ${clientRandom}`);
            }

            const packet = this.buildHandshakePacket(encPayload);

            const parsed = TuyaMessage.parse(packet);
            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log('Handshake CRC', parsed.crc.toString(16), 'calc', parsed.calcCrc.toString(16));
            }
            if (typeof service !== 'undefined') {
                service.log(`🔑 CRC: ${parsed.calcCrc.toString(16)}`);
            }

            this._negotiationTimeout = setTimeout(() => {
                if (this._sessionEstablished) return;
                this.lastErrorTime = Date.now();
                done(new Error('Session negotiation timeout'));
            }, this.timeout);

            let retries = 0;
            this._retryTimer = setInterval(() => {
                if (this.sessionKey || this._sessionEstablished) {
                    clearInterval(this._retryTimer);
                    this._retryTimer = null;
                    return;
                }
                if (Date.now() - startTime > this.timeout) {
                    clearInterval(this._retryTimer);
                    this._retryTimer = null;
                    done(new Error('Negotiation timed out'));
                    return;
                }
                if (retries >= this.maxRetries) {
                    clearInterval(this._retryTimer);
                    this._retryTimer = null;
                    return;
                }
                retries++;
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    log(`Negotiator retry ${retries} for ${this.deviceId}`);
                }
                socket.send(packet, 0, packet.length, 6668, this.ip);
            }, 2000);

            socket.on('error', (err) => {
                this.lastErrorTime = Date.now();
                done(err);
            });

            onMessage = (msg, rinfo) => {
                this.gcmBuffer.add(rinfo.address, msg);
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    log('Handshake packet received:', msg.toString('hex'), 'from', rinfo.address);
                }
                if (rinfo.address !== this.ip) {
                    return;
                }
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    const parsed = TuyaMessage.parse(msg);
                    log('Handshake response raw:', msg.toString('hex'), 'cmd', parsed.cmd.toString(16));
                }

                let response;
                try {
                    response = this.parseHandshakeResponse(msg);
                } catch (err) {
                    if ((service && service.debug) || this.debugMode) {
                        const log = service && service.debug ? service.debug.bind(service) : console.debug;
                        log('Failed to parse handshake:', err.message, msg.toString('hex'));
                    }
                    return;
                }

                if (!response || !response.sessionKey) return;
                if (response.gwId && response.gwId !== this.deviceId) return;

                this.sessionKey = response.sessionKey;
                this.sessionIV = response.sessionIV;
                this.deviceRandom = response.deviceRandom;
                this._sessionEstablished = true;

                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    log(`GCM handshake response received for ${this.deviceId}`);
                }

                SessionCache.set(this.deviceId, {
                    sessionKey: this.sessionKey,
                    sessionIV: this.sessionIV,
                    deviceRandom: this.deviceRandom
                });

                if (this._retryTimer) {
                    clearInterval(this._retryTimer);
                    this._retryTimer = null;
                }
                if (this._negotiationTimeout) {
                    clearTimeout(this._negotiationTimeout);
                    this._negotiationTimeout = null;
                }
                socket.close();
                this.socket = null;
                this.retryCount = 0;

                if (service && service.debug) service.debug('Negotiator session established');
                const result = {
                    sessionKey: this.sessionKey,
                    sessionIV: this.sessionIV,
                    deviceRandom: this.deviceRandom,
                    deviceId: this.deviceId,
                    ip: this.ip,
                    port: this.port
                };

                done(null, result);
            };

            socket.on('message', onMessage);

            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                log('Sending handshake packet:', packet.toString('hex'));
            }
            socket.send(packet, 0, packet.length, 6668, this.ip, (err) => {
                if (err) {
                    this.lastErrorTime = Date.now();
                    if (service && service.error) service.error('Send error: ' + err.message);
                    done(err);
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
     * Descifra un paquete GCM y devuelve el payload
     */
    decryptGcmPacket(msg, cmd) {
        const iv = msg.payload.slice(0, 12);
        const tag = msg.payload.slice(msg.payload.length - 16);
        const ciphertext = msg.payload.slice(12, msg.payload.length - 16);
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(msg.seq);
        const aad = TuyaEncryption.createAAD(cmd, seqBuf, ciphertext.length);
        return {
            iv,
            payload: TuyaEncryptor.decrypt(ciphertext, UDP_KEY, iv.toString('hex'), tag, aad)
        };
    }

    /**
     * Parsea la respuesta del handshake
     */
    parseHandshakeResponse(buffer) {
        const result = TuyaGCMParser.parse(buffer, 0x08);
        if (!result) throw new Error('Invalid handshake packet');
        if ((service && service.debug) || this.debugMode) {
            const log = service && service.debug ? service.debug.bind(service) : console.debug;
            log('Handshake decrypted:', result.payload.toString('hex'));
        }
        const data = JSON.parse(result.payload.toString());
        const deviceRandom = data.random || data.rnd || '';
        const sessionKey = TuyaEncryption.deriveSessionKey(this.deviceKey, this._lastRandom, deviceRandom);
        if (!sessionKey) throw new Error('Invalid negotiation response');
        if (!data.uuid || !data.gwId) throw new Error('Missing handshake fields');
        if (this._uuid && data.uuid !== this._uuid) throw new Error('UUID mismatch');
        if (data.gwId !== this.deviceId) throw new Error('gwId mismatch');
        if (data.version && typeof data.version !== 'string') throw new Error('Invalid version');
        if ((service && service.debug) || this.debugMode) {
            const log = service && service.debug ? service.debug.bind(service) : console.debug;
            log('Negotiator sessionKey', sessionKey);
        }
        if (typeof TuyaNegotiationMessage.verifySessionKey === 'function') {
            TuyaNegotiationMessage.verifySessionKey(sessionKey, this.sessionKey);
        }
        if (typeof TuyaNegotiationMessage.verifyNegotiationKey === 'function') {
            TuyaNegotiationMessage.verifyNegotiationKey(deviceRandom, this.deviceRandom);
        }
        return { ...data, sessionKey, sessionIV: result.iv, deviceRandom };
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
        const md5 = crypto.createHash('md5').update(this.deviceId).digest('hex');
        return md5.match(/.{1,8}/g).join('-');
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
        const interval = this.retryInterval * Math.pow(2, this.retryCount);
        if (this.lastErrorTime && now - this.lastErrorTime < interval) return;
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
        if (this._retryTimer) {
            clearInterval(this._retryTimer);
            this._retryTimer = null;
        }
        if (this._negotiationTimeout) {
            clearTimeout(this._negotiationTimeout);
            this._negotiationTimeout = null;
        }
        this.isNegotiating = false;
        this._lastRandom = null;
        this._sessionEstablished = false;
        this._uuid = null;
    }
}

export default TuyaSessionNegotiator;

