import EventEmitter from '../utils/EventEmitter.js';
import TuyaSessionNegotiator from './TuyaSessionNegotiator.js';

class NegotiatorManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.negotiators = new Map();
        this.failCounts = new Map();
        this.controllers = new Map();
        this.crcMap = new Map();
        this.socket = options.socket || null;
    }

    create(options) {
        const id = options.deviceId;
        if (!id) throw new Error('deviceId required');
        if (this.negotiators.has(id)) return this.negotiators.get(id);
        const negotiator = new TuyaSessionNegotiator({ ...options, manager: this });
        this.negotiators.set(id, negotiator);
        this.failCounts.set(id, 0);
        if (options.controller) {
            this.controllers.set(id, options.controller);
            options.controller.negotiator = negotiator;
        }
        negotiator.on('success', data => {
            this.failCounts.set(id, 0);
            const ctrl = this.controllers.get(id);
            if (ctrl && ctrl.device) {
                const { sessionKey, deviceRandom } = data;
                if (typeof ctrl.device.startSession === 'function') {
                    ctrl.device.startSession(sessionKey, deviceRandom);
                } else if (typeof ctrl.device.setSessionKey === 'function') {
                    ctrl.device.setSessionKey(sessionKey);
                }
            }
            this.emit('negotiation_success', { ...data, deviceId: id });
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

    /**
     * Inicia la negociación para un conjunto de dispositivos de forma concurrente.
     * @param {Array<{deviceId:string, deviceKey:string, ip:string, controller:any}>} devices
     * @param {number} timeout Tiempo máximo global
     */
    startBatchNegotiation(devices = [], timeout = 10000) {
        if (!this.socket) throw new Error('UDP socket not set');
        const pending = new Set();
        for (const opts of devices) {
            const negotiator = this.create(opts);
            pending.add(opts.deviceId);
            const { packet } = negotiator.buildRequest();
            this.socket.send(packet, 40001, '255.255.255.255');
        }
        const timer = setTimeout(() => {
            for (const id of pending) {
                const n = this.negotiators.get(id);
                if (n) {
                    n.emit('error', new Error('Session negotiation timeout'));
                    n.cleanup();
                }
            }
        }, timeout);
        const finishCheck = () => {
            if (pending.size === 0) {
                clearTimeout(timer);
                this.off('negotiation_success', onSuccess);
                this.off('negotiation_error', onError);
            }
        };
        const onSuccess = data => {
            pending.delete(data.deviceId);
            finishCheck();
        };
        const onError = (id) => {
            pending.delete(id);
            finishCheck();
        };
        this.on('negotiation_success', onSuccess);
        this.on('negotiation_error', onError);
    }

    getFailureCount(deviceId) {
        return this.failCounts.get(deviceId) || 0;
    }

    registerCRC(crc, deviceId) {
        this.crcMap.set(crc, deviceId);
    }

    routeResponse(buffer, rinfo = { address: '' }) {
        try {
            const crc = buffer.readUInt32BE(12); // CRC located after cmd
            const id = this.crcMap.get(crc);
            if (!id) return;
            const negotiator = this.negotiators.get(id);
            if (negotiator) {
                negotiator.processResponse(buffer, rinfo);
            }
        } catch (err) {
            // ignore malformed packets
        }
    }
}

export default NegotiatorManager;
