import assert from 'node:assert';
import TuyaGCMParser from '../negotiators/TuyaGCMParser.js';
import TuyaMessage from '../negotiators/TuyaMessage.js';
import { TuyaEncryptor } from '../negotiators/TuyaEncryptor.js';
import crypto from 'node:crypto';
import TuyaEncryption from '../negotiators/TuyaEncryption.js';

(() => {
    const payload = Buffer.from('{}');
    const seq = 1;
    const iv = crypto.randomBytes(12).toString('hex');
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32BE(seq);
    const aad = TuyaEncryption.createAAD(0x08, seqBuf, payload.length);
    const enc = TuyaEncryptor.encrypt(payload, crypto.createHash('md5').update('yGAdlopoPVldABfn','utf8').digest('hex'), iv, aad);
    const encPayload = Buffer.concat([Buffer.from(iv,'hex'), enc.ciphertext, enc.tag]);
    const packet = TuyaMessage.build('000055aa', seq, 0x08, encPayload, '0000aa55');
    const result = TuyaGCMParser.parse(packet, 0x08);
    assert.ok(result && result.payload, 'parser should decrypt');
    console.log('TuyaGCMParser tests passed');
})();
