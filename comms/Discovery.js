// comms/Discovery.js
const dgram = require('dgram');
const EventEmitter = require('events');

class TuyaDiscovery extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port || 6667;
        this.timeout = options.timeout || 5000;
        this.broadcastAddress = options.broadcastAddress || '255.255.255.255';
    }

    discover() {
        const socket = dgram.createSocket('udp4');
        const devices = {};

        // Discovery packet estándar para Tuya LAN
        const payload = Buffer.from('000055aa00000000000000070000000000000000', 'hex');

        socket.bind(() => {
            socket.setBroadcast(true);
            socket.send(payload, 0, payload.length, this.port, this.broadcastAddress, (err) => {
                if (err) {
                    this.emit('error', err);
                    socket.close();
                }
            });
        });

        socket.on('message', (msg, rinfo) => {
            try {
                // Check signature
                if (msg.slice(0, 4).toString('hex') === '000055aa') {
                    // Parse basic fields
                    const devId = msg.slice(20, 36).toString().replace(/\0/g, '');
                    const productKey = msg.slice(36, 56).toString().replace(/\0/g, '');
                    // Try protocol version: often 3 bytes after productKey
                    const protoVer = msg.slice(56, 59).toString().replace(/\0/g, '');
                    // MAC address (may be at bytes 59-65, not always present)
                    const macRaw = msg.slice(59, 65);
                    const mac = [...macRaw].map(b => b.toString(16).padStart(2, '0')).join(':');
                    // Try firmware version: last 4-6 bytes (not always present)
                    const fwVer = msg.slice(-6).toString().replace(/\0/g, '');
                    // Device name (sometimes in productKey, sometimes not sent)

                    if (!devices[devId]) {
                        devices[devId] = {
                            id: devId,
                            ip: rinfo.address,
                            port: rinfo.port,
                            productKey: productKey || undefined,
                            protocolVersion: protoVer || undefined,
                            mac: mac || undefined,
                            firmwareVersion: fwVer || undefined,
                            raw: msg.toString('hex')
                        };
                        this.emit('device', devices[devId]);
                    }
                }
            } catch (err) {
                this.emit('error', err);
            }
        });

        setTimeout(() => {
            socket.close();
            this.emit('done', Object.values(devices));
        }, this.timeout);
    }
}

module.exports = TuyaDiscovery;


/*
--------------------------------------
**¿Cómo se usa desde el controlador?**
--------------------------------------
const TuyaDiscovery = require('./comms/Discovery.js');
const discovery = new TuyaDiscovery({ timeout: 6000 });

discovery.on('device', (dev) => {
    console.log('Dispositivo encontrado:', dev);
});
discovery.on('done', (list) => {
    console.log('Búsqueda finalizada, total:', list.length);
});
discovery.on('error', (err) => {
    console.error('Discovery error:', err);
});

discovery.discover();
*/
