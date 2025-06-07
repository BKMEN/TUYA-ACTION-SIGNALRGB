import crypto from 'node:crypto';
import TuyaMessage from './TuyaMessage.js';
import TuyaEncryption from './TuyaEncryption.js';
import TuyaEncryptor from './TuyaEncryptor.js';

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest('hex');

class TuyaGCMParser {
    static parse(buffer, expectedCmd) {
        const msg = TuyaMessage.parse(buffer);
        if (!msg.crcValid) return null;
        if (expectedCmd !== undefined && msg.cmd !== expectedCmd) return null;
        const iv = msg.payload.slice(0, 12);
        const tag = msg.payload.slice(msg.payload.length - 16);
        const ciphertext = msg.payload.slice(12, msg.payload.length - 16);
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(msg.seq);
        const aad = TuyaEncryption.createAAD(msg.cmd, seqBuf, ciphertext.length);
        const payload = TuyaEncryptor.decrypt(ciphertext, UDP_KEY, iv.toString('hex'), tag, aad);
        if (!payload) return null;
        return { msg, payload, iv: iv.toString('hex') };
    }
}

export default TuyaGCMParser;
