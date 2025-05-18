// TuyaController.js

const TuyaProtocol = require('./TuyaProtocol');

// Asegúrate de que TuyaProtocol sea un constructor o ajusta según corresponda
const TuyaDevice = typeof TuyaProtocol === 'function' ? TuyaProtocol : TuyaProtocol.TuyaDevice;

class TuyaController {
  constructor() {
    // Array para almacenar los dispositivos conectados
    this.devices = [];
  }

  addDevice(deviceInfo) {
    const device = new TuyaDevice(deviceInfo);
    this.devices.push(device);
  }

  async turnOnAll() {
    for (const device of this.devices) {
      if (typeof device.setPower === 'function') {
        await device.setPower(true);
      } else {
        console.warn(`Device does not support setPower:`, device);
      }
    }
    // Implementa métodos adicionales según sea necesario
  }

  // Implementa métodos adicionales según sea necesario
}

module.exports = TuyaController;