const assert = require('assert');
const TuyaDiscovery = require('../comms/Discovery.js');

(async () => {
    const discovery = new TuyaDiscovery({ port: 0 });
    assert.strictEqual(typeof discovery.startDiscovery, 'function', 'startDiscovery missing');
    await discovery.startDiscovery();
    assert.ok(discovery.isRunning, 'discovery should be running');
    await discovery.stopDiscovery();
    assert.ok(!discovery.isRunning, 'discovery should be stopped');
    console.log('Discovery tests passed');
})();
