import assert from 'node:assert';
import DeviceList from '../DeviceList.js';

(() => {
    const types = DeviceList.getDeviceTypes();
    assert.ok(Array.isArray(types), 'Device types should be array');
    const ledStrip = DeviceList.getDeviceTypeConfig('LED Strip');
    assert.ok(ledStrip.defaultLeds > 0, 'Config should have default leds');
    console.log('DeviceList tests passed');
})();

