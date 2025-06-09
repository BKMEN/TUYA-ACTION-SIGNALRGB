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
import DeviceList from '../DeviceList.js';

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest('hex');

function friendly(id) {
    if (DeviceList && typeof DeviceList.getFriendlyName === 'function') {
        return DeviceList.getFriendlyName(id);
    }
    return id;
}

class TuyaSessionNegotiator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.deviceId = options.deviceId;
        this.deviceKey = options.deviceKey;
        this.ip = options.ip;
        // Handshake siempre se envía al puerto 6669, ignorando el valor recibido
        this.port = 6669;
        this.timeout = options.timeout || 10000;
        this.maxRetries = options.maxRetries || 3;
        this.retryInterval = options.retryInterval || 5000;
        this.debugMode = options.debugMode || false;
        this.gcmBuffer = options.gcmBuffer || gcmBuffer;
        this.prefix = options.prefix || '00006699';
        this.suffix = options.suffix || '00009966';

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

        if (!this.deviceKey || Buffer.from(this.deviceKey, 'utf8').length !== 16) {
            throw new Error('Invalid device token length');
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
                    console.log(`Negotiation failed for device: ${friendly(this.deviceId)}`);
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
            console.group('🤝 Handshake params');
            console.log('Negotiator UUID:', this._uuid);
            const payload = {
                uuid: this._uuid,
                t: Math.floor(Date.now() / 1000),
                gwId: this.deviceId,
                random: clientRandom
            };
            console.log('Handshake Token:', this.deviceKey);
            console.log('Handshake UUID:', payload.uuid);
            console.log('Handshake RND:', clientRandom);
            console.groupEnd();

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
                console.log(`Negotiation timeout for device ${friendly(this.deviceId)}`);
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
                socket.send(packet, 0, packet.length, 6669, this.ip);
            }, 2000);

            socket.on('error', (err) => {
                this.lastErrorTime = Date.now();
                done(err);
            });

            onMessage = (msg, rinfo) => {
                this.gcmBuffer.add(rinfo.address, msg);
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                const preview = msg.toString('hex');
                log('Handshake packet received:', preview.slice(0,32) + (preview.length>32?'...':''), 'from', rinfo.address);
                }
                if (rinfo.address !== this.ip) {
                    return;
                }
                if ((service && service.debug) || this.debugMode) {
                    const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    const parsed = TuyaMessage.parse(msg);
                    const rawPrev = msg.toString('hex');
                    log('Handshake response raw:', rawPrev.slice(0,32) + (rawPrev.length>32?'...':''), 'cmd', parsed.cmd.toString(16));
                }

                let response;
                try {
                    response = this.parseHandshakeResponse(msg);
                } catch (err) {
                    if ((service && service.debug) || this.debugMode) {
                        const log = service && service.debug ? service.debug.bind(service) : console.debug;
                    const failPrev = msg.toString('hex');
                    log('Failed to parse handshake:', err.message, failPrev.slice(0,32) + (failPrev.length>32?'...':''));
                    }
                    console.log(`Negotiation failed for device: ${friendly(this.deviceId)}`);
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

                console.log(`✅ Negotiation succeeded for ${friendly(this.deviceId)}`);

                done(null, result);
            };

            socket.on('message', onMessage);

            if ((service && service.debug) || this.debugMode) {
                const log = service && service.debug ? service.debug.bind(service) : console.debug;
                const pktPrev = packet.toString('hex');
                log('Sending handshake packet:', pktPrev.slice(0,32) + (pktPrev.length>32?'...':''));
            }
            socket.send(packet, 0, packet.length, 6669, this.ip, (err) => {
                if (err) {
                    this.lastErrorTime = Date.now();
                    if (service && service.error) service.error('Send error: ' + err.message);
                    done(err);
                } else if (service && typeof service.log === 'function') {
                    service.log(`📤 Handshake enviado a ${this.ip}:6669 (${packet.length} bytes)`);
                }
            });
        });
    }

    /**
     * Construye paquete de handshake
     */
    buildHandshakePacket(payload) {
        console.group('📦 Building handshake packet');
console.log(' - Prefix:', this.prefix || '000055aa');
console.log(' - Sequence:', this.sequenceNumber + 1);
console.log(' - Command:', '0x05');
console.log(' - Payload length:', payload.length);

const packet = TuyaMessage.build(
    this.prefix,
    ++this.sequenceNumber,
    0x05,
    payload,
    this.suffix
);

const parsedTmp = TuyaMessage.parse(packet);

console.log(' - CRC:', parsedTmp.crc.toString(16));
console.log(' - Suffix:', parsedTmp.suffix);

const expectedLen = 16 + payload.length + 8;
if (packet.length !== expectedLen) {
    console.warn('⚠️ Warning: handshake length mismatch', packet.length, '!=', expectedLen);
}

if (packet.slice(-4).toString('hex') !== (this.suffix || '0000aa55')) {
    console.warn('⚠️ Warning: handshake missing suffix', (this.suffix || '0000aa55').toUpperCase());
}

        if (service && service.debug) {
            const parsed = TuyaMessage.parse(packet);
            service.debug('Handshake packet CRC', parsed.crc.toString(16), 'calc', parsed.calcCrc.toString(16));
        }
        console.groupEnd();
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
        if (!result) {
            console.log('HMAC mismatch');
            throw new Error('Invalid handshake packet');
        }
        if ((service && service.debug) || this.debugMode) {
            const log = service && service.debug ? service.debug.bind(service) : console.debug;
            const decPrev = result.payload.toString('hex');
            log('Handshake decrypted:', decPrev.slice(0,32) + (decPrev.length>32?'...':''));
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
            const ok = TuyaNegotiationMessage.verifySessionKey(sessionKey, this.sessionKey);
            console.log(ok ? 'HMAC OK' : 'HMAC mismatch');
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

