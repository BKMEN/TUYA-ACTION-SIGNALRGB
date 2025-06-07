import assert from 'node:assert';
import NegotiatorManager from '../negotiators/NegotiatorManager.js';

(() => {
    const mgr = new NegotiatorManager();
    const n1 = mgr.create({ deviceId: '1', deviceKey: 'a', ip: '0.0.0.0' });
    const n2 = mgr.create({ deviceId: '2', deviceKey: 'b', ip: '0.0.0.0' });
    assert.ok(mgr.get('1') === n1, 'manager returns negotiator');
    assert.strictEqual(mgr.negotiators.size, 2, 'two negotiators');
    mgr.remove('1');
    assert.ok(!mgr.get('1'), 'removed negotiator');
    console.log('NegotiatorManager tests passed');
})();
