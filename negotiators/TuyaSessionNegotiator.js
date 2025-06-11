import EventEmitter from '../utils/EventEmitter.js';
import crypto from 'node:crypto';
import TuyaEncryption from './TuyaEncryption.js';
import { buildNegotiationPacket } from './TuyaNegotiationMessage.js';
import TuyaMessage from './TuyaMessage.js';
import TuyaGCMParser from './TuyaGCMParser.js';
import SessionCache from './SessionCache.js';
import DeviceList from '../DeviceList.js';

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
        this.manager = options.manager;
        this.port = 6669;
        this.debugMode = options.debugMode || false;
        this.sessionKey = null;
        this.sessionIV = null;
        this.deviceRandom = null;
        this._lastRandom = null;
        this._uuid = null;
        this._sessionEstablished = false;
    }

    /**
     * Build the negotiation request packet. Returns the packet and parameters
     * used so the caller can broadcast it.
     */
    buildRequest() {
        const uuid = this.generateUUID();
        const random = TuyaEncryption.generateRandomHexBytes(16);
        const ts = Math.floor(Date.now() / 1000);
        this._uuid = uuid;
        this._lastRandom = random;
        const packet = buildNegotiationPacket({
            id: this.deviceId,
            localKey: this.deviceKey,
            uuid,
            random,
            ts
        });
        const crc = packet.readUInt32BE(12);
        if (this.manager && typeof this.manager.registerCRC === 'function') {
            this.manager.registerCRC(crc, this.deviceId);
        }
        if (this.debugMode) {
            console.debug('Broadcasting negotiation:', packet.toString('hex'));
        }
        return { packet, uuid, random, ts };
    }

    processHandshakeResponse(buffer) {
        const command = buffer.readUInt32BE(8);
        if (command !== 6) {
            if (this.debugMode) {
                console.debug(`[NEGOTIATOR] Ignorando paquete con comando ${command}`);
            }
            return false;
        }
        return this.parseHandshakeResponse(buffer);
    }

    parseHandshakeResponse(buffer) {
        const parsedMsg = TuyaMessage.parse(buffer);
        const result = TuyaGCMParser.parse(buffer, 0x06);
        if (!result) {
            throw new Error('Invalid handshake packet');
        }
        const data = JSON.parse(result.payload.toString());
        const deviceRandom = data.random || data.rnd || '';
        const sessionKey = TuyaEncryption.deriveSessionKey(this.deviceKey, this._lastRandom, deviceRandom);
        if (!sessionKey) throw new Error('Invalid negotiation response');
        if (this._uuid && data.uuid !== this._uuid) throw new Error('UUID mismatch');
        if (data.gwId !== this.deviceId) throw new Error('gwId mismatch');
        return { ...data, sessionKey, sessionIV: result.iv, deviceRandom };
    }

    processResponse(buffer, rinfo = { address: '' }) {
        if (this.sessionKey || this._sessionEstablished) return;
        let response;
        try {
            response = this.processHandshakeResponse(buffer);
            if (!response) return;
        } catch (err) {
            this.emit('error', err);
            return;
        }
        if (!response.sessionKey) return;
        this.sessionKey = response.sessionKey;
        this.sessionIV = response.sessionIV;
        this.deviceRandom = response.deviceRandom;
        this._sessionEstablished = true;
        this.ip = rinfo.address || this.ip;
        SessionCache.set(this.deviceId, {
            sessionKey: this.sessionKey,
            sessionIV: this.sessionIV,
            deviceRandom: this.deviceRandom
        });
        this.emit('success', {
            sessionKey: this.sessionKey,
            sessionIV: this.sessionIV,
            deviceRandom: this.deviceRandom,
            deviceId: this.deviceId,
            ip: this.ip,
            port: this.port
        });
    }

    generateUUID() {
        const md5 = crypto.createHash('md5').update(this.deviceId).digest('hex');
        return md5.match(/.{1,8}/g).join('-');
    }

    cleanup() {
        this.sessionKey = null;
        this.sessionIV = null;
        this.deviceRandom = null;
        this._lastRandom = null;
        this._sessionEstablished = false;
        this._uuid = null;
    }
}

export default TuyaSessionNegotiator;
