export default class TuyaMessage {
    static crc32(buffer) {
        let crc = 0 ^ (-1);
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc >>> 8) ^ TuyaMessage.table[(crc ^ buffer[i]) & 0xFF];
        }
        return (crc ^ (-1)) >>> 0;
    }

    static build(prefix, seq, cmd, payload, suffix = '0000aa55') {
        const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        const buf = Buffer.alloc(16 + payloadBuf.length + 8);
        buf.write(prefix, 0, 4, 'hex');
        buf.writeUInt32BE(seq, 4);
        buf.writeUInt32BE(cmd, 8);
        buf.writeUInt32BE(payloadBuf.length, 12);
        payloadBuf.copy(buf, 16);
        const crc = TuyaMessage.crc32(buf.slice(0, 16 + payloadBuf.length));
        buf.writeUInt32BE(crc, 16 + payloadBuf.length);
        buf.write(suffix, 16 + payloadBuf.length + 4, 4, 'hex');
        return buf;
    }

    static parse(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
            throw new Error('Packet too short');
        }
        const prefix = buffer.slice(0,4).toString('hex');
        if (prefix !== '000055aa' && prefix !== '00006699') {
            throw new Error('Invalid prefix');
        }
        const seq = buffer.readUInt32BE(4);
        const cmd = buffer.readUInt32BE(8);
        const len = buffer.readUInt32BE(12);
        if (buffer.length < 16 + len + 8) {
            throw new Error('Incomplete packet');
        }
        const payload = buffer.slice(16,16+len);
        const crc = buffer.readUInt32BE(16+len);
        const calc = TuyaMessage.crc32(buffer.slice(0,16+len));
        const suffix = buffer.slice(16+len+4,16+len+8).toString('hex');
        return {prefix, seq, cmd, len, payload, crc, calcCrc: calc, crcValid: crc===calc, suffix};
    }
}

TuyaMessage.table = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();
