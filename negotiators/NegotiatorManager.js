import EventEmitter from '../utils/EventEmitter.js';
import TuyaSessionNegotiator from './TuyaSessionNegotiator.js';

class NegotiatorManager extends EventEmitter {
    constructor() {
        super();
        this.negotiators = new Map();
        this.failCounts = new Map();
        this.controllers = new Map();
        this.crcMap = new Map();
    }

    create(options) {
        const id = options.deviceId;
        if (!id) throw new Error('deviceId required');
        if (this.negotiators.has(id)) return this.negotiators.get(id);
        const negotiator = new TuyaSessionNegotiator(options);
        this.negotiators.set(id, negotiator);
        this.failCounts.set(id, 0);
        if (options.controller) this.controllers.set(id, options.controller);
        if (options.crc) this.crcMap.set(options.crc, id);
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
            for (const [crc, id] of this.crcMap.entries()) {
                if (id === deviceId) {
                    this.crcMap.delete(crc);
                    break;
                }
            }
        }
    }

    getFailureCount(deviceId) {
        return this.failCounts.get(deviceId) || 0;
    }

    routeResponse(crc, buffer, rinfo) {
        const id = this.crcMap.get(crc);
        if (!id) return;
        const negotiator = this.negotiators.get(id);
        if (negotiator && typeof negotiator.processResponse === 'function') {
            negotiator.processResponse(buffer, rinfo);
        }
    }
}

export default NegotiatorManager;
