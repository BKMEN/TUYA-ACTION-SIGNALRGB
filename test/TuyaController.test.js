const assert = require('assert');
const TuyaController = require('../TuyaController');
const TuyaDeviceModel = require('../models/TuyaDeviceModel');

(() => {
    const device = new TuyaDeviceModel({ id: '1', ip: '127.0.0.1', key: '1234' });
    const ctrl = new TuyaController(device);
    assert.ok(ctrl.device instanceof TuyaDeviceModel, 'controller has device');
    console.log('TuyaController tests passed');
})();
