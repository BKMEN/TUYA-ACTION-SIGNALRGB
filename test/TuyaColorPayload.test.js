import assert from 'node:assert';
import TuyaController from '../TuyaController.js';
import TuyaDeviceModel from '../models/TuyaDeviceModel.js';

(() => {
    const model = new TuyaDeviceModel({ id: '1', ip: '0.0.0.0', key: 'abcd', type: 'LED Controller' });
    const ctrl = new TuyaController(model);
    const payloadStr = ctrl.buildColorPayload([{ r: 1, g: 2, b: 3 }]);
    const payload = JSON.parse(payloadStr);
    assert.strictEqual(payload.dps['24'], '010203');
    console.log('TuyaColorPayload test passed');
})();
