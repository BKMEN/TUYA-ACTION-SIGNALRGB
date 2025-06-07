import EventEmitter from '../utils/EventEmitter.js';
import TuyaSessionNegotiator from './TuyaSessionNegotiator.js';

class NegotiatorManager extends EventEmitter {
    constructor() {
        super();
        this.negotiators = new Map();
    }

    create(options) {
        const id = options.deviceId;
        if (!id) throw new Error('deviceId required');
        if (this.negotiators.has(id)) return this.negotiators.get(id);
        const negotiator = new TuyaSessionNegotiator(options);
        this.negotiators.set(id, negotiator);
        negotiator.on('success', data => this.emit('negotiation_success', data));
        negotiator.on('error', err => this.emit('negotiation_error', id, err));
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
        }
    }
}

export default NegotiatorManager;
