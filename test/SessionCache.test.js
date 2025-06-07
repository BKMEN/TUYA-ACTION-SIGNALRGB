import assert from 'node:assert';
import SessionCache from '../negotiators/SessionCache.js';

(() => {
    SessionCache.set('dev1', { sessionKey: 'aa', sessionIV: 'bb' });
    const data = SessionCache.get('dev1');
    assert.strictEqual(data.sessionKey, 'aa');
    SessionCache.delete('dev1');
    assert.strictEqual(SessionCache.get('dev1'), null);
    console.log('SessionCache tests passed');
})();
