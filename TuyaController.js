// TuyaController.js
const TuyaDiscovery = require('./comms/Discovery.js');

class TuyaController {
    constructor() {
        this.devices = [];
    }

    discoverDevices() {
        const discovery = new TuyaDiscovery({ timeout: 6000 });
        discovery.on('device', (dev) => {
            console.log('Dispositivo encontrado:', dev);
            this.devices.push(dev);
        });
        discovery.on('done', (list) => {
            console.log('Búsqueda finalizada, total:', list.length);
        });
        discovery.on('error', (err) => {
            console.error('Discovery error:', err);
        });

        discovery.discover();
    }
}

module.exports = TuyaController;

/*
---- USO ----
const TuyaController = require('./TuyaController.js');
const controller = new TuyaController();
controller.discoverDevices();
*/
