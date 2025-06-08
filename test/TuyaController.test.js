import assert from 'node:assert';
import TuyaController from '../TuyaController.js';
import TuyaDeviceModel from '../models/TuyaDeviceModel.js';

(() => {
    const device = new TuyaDeviceModel({ id: '1', ip: '127.0.0.1', key: '1234' });
    const ctrl = new TuyaController(device);
    assert.ok(ctrl.device instanceof TuyaDeviceModel, 'controller has device');
    const added = ctrl.addDevice({ id: '2', ip: '127.0.0.2', key: 'abcd' });
    assert.ok(ctrl.devices.length === 2, 'addDevice stores device');
    assert.ok(added instanceof TuyaDeviceModel, 'addDevice returns model');
    console.log('TuyaController tests passed');
})();

