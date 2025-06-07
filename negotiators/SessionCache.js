class SessionCache {
    constructor() {
        this.cache = new Map();
    }

    set(deviceId, data) {
        this.cache.set(deviceId, { ...data });
    }

    get(deviceId) {
        return this.cache.get(deviceId) || null;
    }

    delete(deviceId) {
        this.cache.delete(deviceId);
    }

    clear() {
        this.cache.clear();
    }
}

export default new SessionCache();
