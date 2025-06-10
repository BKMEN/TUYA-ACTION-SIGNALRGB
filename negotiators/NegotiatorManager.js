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

    /**
     * Negotiates a batch of devices using a shared UDP socket
     * @param {Array<object>} devices - array of { deviceId, deviceKey, ip }
     * @param {object} options
     * @returns {Promise<Array>}
     */
    async negotiateBatch(devices, options = {}) {
        if (!Array.isArray(devices) || devices.length === 0) {
            return [];
        }
        const dgram = await import('node:dgram');
        const socket = dgram.createSocket('udp4');
        const listenPort = options.listenPort || 40001;
        await new Promise(res => socket.bind(listenPort, '0.0.0.0', res));
        socket.setBroadcast(true);
        const negotiators = devices.map(info => this.create({
            ...info,
            listenPort,
            broadcastAddress: options.broadcastAddress,
            broadcastPort: options.broadcastPort,
            socket
        }));
        const results = await Promise.allSettled(
            negotiators.map(n => n.negotiateSession())
        );
        try { socket.close(); } catch (_) {}
        return results;
    }
}

export default NegotiatorManager;
