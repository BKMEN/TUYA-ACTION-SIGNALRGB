// TuyaController.js

const TuyaProtocol = require('./TuyaProtocol');

// Ensure TuyaProtocol is a constructor or adjust accordingly
const TuyaDevice = typeof TuyaProtocol === 'function' ? TuyaProtocol : TuyaProtocol.TuyaDevice;

class TuyaController {
  constructor() {
    // Array to store connected devices
    this.devices = [];
  }

  addDevice(deviceInfo) {
    const device = new TuyaDevice(deviceInfo);
    this.devices.push(device);
  }
      if (typeof device.setPower === 'function') {
        await device.setPower(true);
      } else {
        console.warn(`Device does not support setPower:`, device);
      }
  async turnOnAll() {
    for (const device of this.devices) {
  // Implement additional methods as needed
    }
  }

  // Implementa métodos adicionales según sea necesario
}

module.exports = TuyaController;