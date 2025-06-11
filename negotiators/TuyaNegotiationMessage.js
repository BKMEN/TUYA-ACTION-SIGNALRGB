import crypto from 'crypto';
import TuyaMessage from './TuyaMessage.js';

// Packet constants as used in Tuya v3.5
const HEADER = Buffer.from('00006699', 'hex');
const TAIL = Buffer.from('00009966', 'hex');
const MESSAGE_TYPE_NEGOTIATION = 5;

/**
 * Build a negotiation packet following the v3.5 specification.
 * @param {object} device Device info containing id, localKey, uuid and random.
 * @param {number} sequence Optional sequence number (defaults to 1)
 * @returns {Buffer} Negotiation packet ready to broadcast
 */
function buildNegotiationPacket(device, sequence = 1) {
    const payloadJson = JSON.stringify({
        gwId: device.id,
        random: device.random,
        t: device.ts,
        uuid: device.uuid.replace(/-/g, '')
    });

    const payloadBuf = Buffer.from(payloadJson, 'utf8');

    const key = Buffer.from(device.localKey, 'utf8');
    const iv = Buffer.from(device.random, 'hex');
    const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(payloadBuf), cipher.final()]);
    const tag = cipher.getAuthTag();

    const finalPayload = Buffer.concat([iv, encrypted, tag]);

    const seqBuf = Buffer.alloc(4); seqBuf.writeUInt32BE(sequence);
    const cmdBuf = Buffer.alloc(4); cmdBuf.writeUInt32BE(MESSAGE_TYPE_NEGOTIATION);
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(finalPayload.length);

    // CRC calculated over [len][payload]
    const crcVal = TuyaMessage.crc32(Buffer.concat([lenBuf, finalPayload]));
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crcVal);

    return Buffer.concat([
        HEADER,
        seqBuf,
        cmdBuf,
        crcBuf,
        lenBuf,
        finalPayload,
        TAIL
    ]);
}

export { buildNegotiationPacket };
