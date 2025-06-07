import TuyaUDP from '../comms/TuyaUDP.js';
import assert from 'node:assert';

(async () => {
    const udp = new TuyaUDP();
    assert.ok(udp.socket, 'socket should exist');
    await udp.send('test', 41234, '127.0.0.1').catch(() => {});
    udp.close();
    console.log('TuyaUDP tests passed');
})();

