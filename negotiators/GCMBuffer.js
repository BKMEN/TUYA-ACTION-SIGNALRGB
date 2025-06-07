class GCMBuffer {
    constructor(ttl = 5000) {
        this.ttl = ttl;
        this.map = new Map();
    }

    add(ip, packet) {
        this.map.set(ip, { packet, ts: Date.now() });
    }

    get(ip) {
        const entry = this.map.get(ip);
        if (!entry) return null;
        if (Date.now() - entry.ts > this.ttl) {
            this.map.delete(ip);
            return null;
        }
        return entry.packet;
    }

    clear() {
        this.map.clear();
    }
}

export default new GCMBuffer();
