import { DiscoveryService } from './TuyaRazer.js';
import DeviceList, { TestDevices } from './Data/DeviceList.test.js';

// Simple service mock for testing
global.service = {
    controllers: [],
    controllerMap: {},
    settings: {},
    log: console.log,
    hasController(id) { return !!this.controllerMap[id]; },
    getController(id) { return this.controllerMap[id]; },
    addController(controller) {
        this.controllerMap[controller.id] = controller;
        this.controllers.push({ obj: controller });
        this.log(`Controller added: ${controller.id}`);
    },
    removeController(controller) {
        this.controllers = this.controllers.filter(c => c.obj !== controller);
        delete this.controllerMap[controller.id];
    },
    announceController(controller) {
        this.log(`Announce controller ${controller.id}`);
    },
    updateController(controller) {
        this.log(`Update controller ${controller.id}`);
    },
    saveSetting(id, key, value) {
        if (!this.settings[id]) this.settings[id] = {};
        this.settings[id][key] = value;
    },
    getSetting(id, key) {
        return this.settings[id] ? this.settings[id][key] : null;
    }
};

const discovery = new DiscoveryService();
discovery.Initialize();

if (Array.isArray(TestDevices)) {
    TestDevices.forEach(dev => {
        const data = {
            gwId: dev.id,
            uuid: dev.id,
            ip: dev.ip,
            localKey: dev.key,
            version: dev.version,
            productKey: dev.productKey,
            deviceType: dev.productKey,
            enabled: dev.enabled
        };
        discovery.handleTuyaDiscovery(data);
    });
}

setInterval(() => discovery.Update(), 1000);

