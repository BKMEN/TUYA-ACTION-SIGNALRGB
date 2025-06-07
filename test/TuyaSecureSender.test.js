import assert from 'node:assert';
import TuyaSecureSender from '../comms/TuyaSecureSender.js';

(() => {
    const sender = new TuyaSecureSender({
        deviceId: 'dev1',
        ip: '127.0.0.1',
        sessionKey: '00112233445566778899aabbccddeeff'
    });
    const packet = sender.buildPacket(Buffer.from('{}'));
    assert.ok(packet.slice(0,4).toString('hex') === '000055aa', 'packet prefix');
    sender.close();
    console.log('TuyaSecureSender tests passed');
})();
