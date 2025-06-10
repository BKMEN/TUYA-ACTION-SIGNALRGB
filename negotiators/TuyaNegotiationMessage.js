import { TuyaEncryptor } from './TuyaEncryptor.js';
import TuyaMessage from './TuyaMessage.js';

const HEADER = Buffer.from('00006699', 'hex');
const TAIL = Buffer.from('00009966', 'hex');
const MESSAGE_TYPE_NEGOTIATION = 5;

function buildNegotiationPacket(device) {
    const payloadJson = JSON.stringify({
        gwId: device.id,
        random: device.random,
        t: device.ts,
        uuid: device.uuid.replace(/-/g, '')
    });

    const encryptor = new TuyaEncryptor(device);
    const encryptedPayload = encryptor.encryptNegotiationPayload(payloadJson);

    const sequence = 1;
    const size = 12 + encryptedPayload.length;

    const seqBuffer = Buffer.alloc(4); seqBuffer.writeUInt32BE(sequence);
    const cmdBuffer = Buffer.alloc(4); cmdBuffer.writeUInt32BE(MESSAGE_TYPE_NEGOTIATION);
    const lenBuffer = Buffer.alloc(4); lenBuffer.writeUInt32BE(size);

    const bufferForCrc = Buffer.concat([seqBuffer, cmdBuffer, lenBuffer, encryptedPayload]);
    const crc = TuyaMessage.crc32(bufferForCrc);
    const crcBuffer = Buffer.alloc(4); crcBuffer.writeUInt32BE(crc);

    const finalPacket = Buffer.concat([
        HEADER,
        seqBuffer,
        cmdBuffer,
        lenBuffer,
        encryptedPayload,
        crcBuffer,
        TAIL
    ]);

    finalPacket.writeUInt32BE(finalPacket.length - 8, 12);

    return finalPacket;
}

export { buildNegotiationPacket };
