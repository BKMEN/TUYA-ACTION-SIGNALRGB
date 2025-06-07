import crypto from 'node:crypto';
import TuyaEncryptor from './TuyaEncryptor.js';
import TuyaMessage from './TuyaMessage.js';
import TuyaEncryption from './TuyaEncryption.js';

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'utf8').digest('hex');

export default class TuyaNegotiationMessage {
    static parse(buffer, deviceKey, clientRandom) {
        const msg = TuyaMessage.parse(buffer);
        if (!msg.crcValid) throw new Error('Invalid CRC in handshake');
        if (msg.cmd !== 0x06) throw new Error('Unexpected command');
        const iv = msg.payload.slice(0,12);
        const tag = msg.payload.slice(msg.payload.length - 16);
        const ciphertext = msg.payload.slice(12, msg.payload.length - 16);
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeUInt32BE(msg.seq);
        const aad = TuyaEncryption.createAAD(0x06, seqBuf, ciphertext.length);
        const decrypted = TuyaEncryptor.decrypt(ciphertext, UDP_KEY, iv.toString('hex'), tag, aad);
        if (!decrypted) throw new Error('Failed to decrypt handshake');
        const data = JSON.parse(decrypted.toString());
        if (!data.random || typeof data.random !== 'string' || data.random.length < 8) {
            throw new Error('Invalid handshake random');
        }
        const sessionKey = TuyaEncryption.deriveSessionKey(deviceKey, clientRandom, data.random);
        if (!sessionKey || sessionKey.length !== 32) {
            throw new Error('Invalid session key');
        }
        return { data, sessionKey };
    }
}
