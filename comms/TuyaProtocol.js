/**
 * Implementación del protocolo Tuya
 */

// Evita que SignalRGB lo cargue como plugin
function VendorId() { return null; }
function ProductId() { return null; }

class TuyaDevice {
  constructor(config) {
    this.constructor.name = "TuyaProtocolDevice"; // Evita que SignalRGB lo cargue como plugin
    
    this.id = config.id || '';
    this.key = config.key || '';
    this.ip = config.ip || '';
    this.version = config.version || '3.3';
    this.connected = false;
  }

  async connect() {
    // Implementación simplificada 
    this.connected = true;
    return true;
  }

  async disconnect() {
    this.connected = false;
    return true;
  }

  async setPower(state) {
    return true;
  }

  async setBrightness(value) {
    return true;
  }

  async setColor(color) {
    return true;
  }
}

// Añadir propiedades para que SignalRGB lo ignore
TuyaDevice.VendorId = VendorId;
TuyaDevice.ProductId = ProductId;

module.exports = TuyaDevice;
