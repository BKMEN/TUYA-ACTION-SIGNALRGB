// ui/service.js 
const TuyaController = require("../TuyaController.js");

module.exports = {
    devices: [],
    selectedDevice: null,

    discoverDevices() {
        TuyaController.discoverDevices((devices) => {
            this.devices = devices;
            if (devices.length > 0) {
                this.selectedDevice = devices[0];
            }
            this.notifyChanged && this.notifyChanged();
        });
    },

    setColor(color) {
        if (this.selectedDevice) {
            TuyaController.setColor(this.selectedDevice, color);
        }
        this.notifyChanged && this.notifyChanged();
    },

    setLedCount(count) {
        if (this.selectedDevice) {
            TuyaController.setLedCount(this.selectedDevice, count);
        }
        this.notifyChanged && this.notifyChanged();
    }
    // ...más funciones
};
