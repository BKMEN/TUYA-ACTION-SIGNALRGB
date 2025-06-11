import assert from 'node:assert';
import { buildNegotiationPacket } from '../negotiators/TuyaNegotiationMessage.js';
import TuyaMessage from '../negotiators/TuyaMessage.js';

(() => {
    const device = {
        id: 'testid',
        localKey: '0123456789abcdef',
        uuid: '1111111111111111',
        random: '0123456789abcdef01234567',
        ts: 1
    };
    const packet = buildNegotiationPacket(device);
    const parsed = TuyaMessage.parse(packet);
    assert.strictEqual(parsed.prefix, '00006699', 'prefix');
    assert.strictEqual(parsed.seq, 1);
    assert.strictEqual(parsed.cmd, 5);
    assert.ok(parsed.crcValid, 'crc valid');
    assert.strictEqual(parsed.len, packet.length - 24, 'length matches');
    console.log('TuyaMessage v3.5 parse test passed');
})();
