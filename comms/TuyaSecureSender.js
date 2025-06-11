import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { TuyaEncryptor } from '../negotiators/TuyaEncryptor.js';
import TuyaEncryption from '../negotiators/TuyaEncryption.js';
import TuyaMessage from '../negotiators/TuyaMessage.js';

class TuyaSecureSender {
    constructor(options = {}) {
        this.deviceId = options.deviceId;
        this.ip = options.ip;
        this.port = options.port || 6668;
        this.sessionKey = options.sessionKey;
        this.sequence = 0;
        this.debugMode = options.debugMode || false;
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', (msg, rinfo) => {
            console.log('📩 UDP RESPONSE:', msg.toString('hex'), 'from', rinfo.address);
        });
    }

    buildPacket(payload) {
        const seq = ++this.sequence;
        const iv = crypto.randomBytes(12).toString('hex');
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(seq);
        const aad = TuyaEncryption.createAAD(0x07, seqBuf, payload.length);
        const enc = TuyaEncryptor.encrypt(payload, this.sessionKey, iv, aad);
        const encPayload = Buffer.concat([
            Buffer.from(iv, 'hex'),
            enc.ciphertext,
            enc.tag
        ]);
        return TuyaMessage.build('000055aa', seq, 0x07, encPayload, '0000aa55');
    }

    send(dpPayload) {
        const payloadStr = typeof dpPayload === 'string' ? dpPayload : JSON.stringify(dpPayload);
        const packet = this.buildPacket(Buffer.from(payloadStr));
        if (this.debugMode) {
            console.debug('SecureSender packet:', packet.toString('hex'));
        }
        return new Promise((resolve, reject) => {
            this.socket.send(packet, 0, packet.length, this.port, this.ip, err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    close() {
        if (this.socket) {
            try { this.socket.close(); } catch (_) {}
            this.socket = null;
        }
    }
}

export default TuyaSecureSender;
