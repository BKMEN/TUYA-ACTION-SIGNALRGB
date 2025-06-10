import crypto from 'node:crypto';
import TuyaEncryptor from './TuyaEncryptor.js';
import TuyaEncryption from './TuyaEncryption.js';
import TuyaMessage from './TuyaMessage.js';

const BROADCAST_KEY = '6f36045d84b042e01e29b7c819e37cf7';
const HEADER = '00006699';
const TAIL = '00009966';
const MSG_TYPE_REQUEST = 0x00000005;

export function buildBatchPacket(devices, sequence = 0) {
  if (!Array.isArray(devices) || devices.length === 0) {
    throw new Error('devices array required');
  }
  const nonce = crypto.randomBytes(12);
  const deviceBuffers = [];
  // create AAD for entire batch
  const crc = computeBatchCrc(devices);
  const aad = createAad(sequence, MSG_TYPE_REQUEST, crc, devices.length);
  for (const dev of devices) {
    const data = Buffer.from('00000000' + dev.token + dev.random, 'hex');
    const enc = TuyaEncryptor.encrypt(data, BROADCAST_KEY, nonce.toString('hex'), aad);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(enc.ciphertext.length);
    deviceBuffers.push(Buffer.from(dev.crc, 'hex'));
    deviceBuffers.push(lenBuf);
    deviceBuffers.push(enc.ciphertext);
    deviceBuffers.push(enc.tag);
  }
  const payload = Buffer.concat([Buffer.from(aad,'hex'), nonce, ...deviceBuffers]);
  const packet = TuyaMessage.build(HEADER, sequence, MSG_TYPE_REQUEST, payload, TAIL);
  return packet;
}

function computeBatchCrc(devices) {
  const ids = devices.map(d => d.crc).join('');
  return TuyaMessage.crc32(Buffer.from(ids, 'hex'));
}

function createAad(sequence, type, crc, deviceCount) {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(sequence, 4);
  buf.writeUInt32BE(type, 8);
  buf.writeUInt32BE(crc >>> 0, 12);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(deviceCount,0);
  return Buffer.concat([buf, lenBuf]);
}
