// TuyaController.js
const TuyaDiscovery = require('./comms/Discovery.js');

class TuyaController {
    constructor() {
        this.devices = [];
    }

    // Recibe callback cuando termina discovery
    discoverDevices(callback) {
        const TuyaDiscovery = require('./comms/Discovery.js');
        const discovery = new TuyaDiscovery({ timeout: 6000 });
        this.devices = [];
        discovery.on('device', (dev) => {
            this.devices.push(dev);
        });
        discovery.on('done', (list) => {
            if (callback) callback(list);
        });
        discovery.on('error', (err) => {
            console.error('Discovery error:', err);
        });

        discovery.discover();
    }
}
module.exports = TuyaController;


module.exports = TuyaController;

/*
---- USO ----
const TuyaController = require('./TuyaController.js');
const controller = new TuyaController();
controller.discoverDevices();
*/
