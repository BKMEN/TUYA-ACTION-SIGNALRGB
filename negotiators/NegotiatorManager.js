import EventEmitter from '../utils/EventEmitter.js';
import TuyaSessionNegotiator from './TuyaSessionNegotiator.js';

class NegotiatorManager extends EventEmitter {
    constructor() {
        super();
        this.negotiators = new Map();
        this.failCounts = new Map();
        this.controllers = new Map();
    }

    create(options) {
        const id = options.deviceId;
        if (!id) throw new Error('deviceId required');
        if (this.negotiators.has(id)) return this.negotiators.get(id);
        const negotiator = new TuyaSessionNegotiator(options);
        this.negotiators.set(id, negotiator);
        this.failCounts.set(id, 0);
        if (options.controller) this.controllers.set(id, options.controller);
        negotiator.on('success', data => {
            this.failCounts.set(id, 0);
            this.emit('negotiation_success', data);
        });
        negotiator.on('error', err => {
            const count = (this.failCounts.get(id) || 0) + 1;
            this.failCounts.set(id, count);
            this.emit('negotiation_error', id, err);
            if (count >= 3) {
                const ctrl = this.controllers.get(id);
                if (ctrl && typeof ctrl.setOffline === 'function') {
                    ctrl.setOffline();
                }
                this.emit('device_offline', id);
            }
        });
        return negotiator;
    }

    get(deviceId) {
        return this.negotiators.get(deviceId);
    }

    remove(deviceId) {
        const n = this.negotiators.get(deviceId);
        if (n) {
            n.cleanup();
            this.negotiators.delete(deviceId);
            this.failCounts.delete(deviceId);
            this.controllers.delete(deviceId);
        }
    }

    getFailureCount(deviceId) {
        return this.failCounts.get(deviceId) || 0;
    }
}

export default NegotiatorManager;
