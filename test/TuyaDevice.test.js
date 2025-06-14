import assert from 'node:assert';
import TuyaDevice from '../TuyaDevice.js';

(() => {
    const dev = new TuyaDevice({ id: '1', ip: '127.0.0.1', key: '1234' });
    dev.setLedCount(10).then(() => {
        assert.strictEqual(dev.ledCount, 10);
        console.log('TuyaDevice tests passed');
    });
})();

