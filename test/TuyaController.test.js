import assert from 'node:assert';
import TuyaController from '../TuyaController.js';
import TuyaDeviceModel from '../models/TuyaDeviceModel.js';

(() => {
    const device = new TuyaDeviceModel({ id: '1', ip: '127.0.0.1', key: '1234' });
    const ctrl = new TuyaController(device);
    assert.ok(ctrl.device instanceof TuyaDeviceModel, 'controller has device');
    console.log('TuyaController tests passed');
})();

