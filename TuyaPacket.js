/**
 * Utilidades para manejar paquetes del protocolo Tuya
 */

// Evita que SignalRGB lo cargue como plugin
function VendorId() { return null; }
function ProductId() { return null; }

// Constantes
const MAGIC_PREFIX = 0x000055aa;
const MAGIC_SUFFIX = 0x0000aa55;

// Crear una clase para manejar paquetes
class TuyaPacket {
  constructor() {
    this.constructor.name = "TuyaPacket"; // Evita que SignalRGB lo cargue como plugin
  }

  static createPacket(command, payload, sequence) {
    // Implementación correcta sin errores de sintaxis
    const bodyBuffer = Buffer.from(payload || '');
    const headerLength = 16; // 4 bytes prefix, 4 bytes sequence, 4 bytes command, 4 bytes length
    const buffer = Buffer.alloc(headerLength + bodyBuffer.length);
    
    // Write header
    buffer.writeUInt32BE(MAGIC_PREFIX, 0);
    buffer.writeUInt32BE(sequence || 0, 4);
    buffer.writeUInt32BE(command, 8);
    buffer.writeUInt32BE(bodyBuffer.length, 12);
    
    // Copy payload
    bodyBuffer.copy(buffer, headerLength);
    
    return buffer;
  }

  static parsePacket(buffer) {
    if (buffer.length < 16) {
      return null;
    }
    
    const prefix = buffer.readUInt32BE(0);
    if (prefix !== MAGIC_PREFIX) {
      return null;
    }
    
    const sequence = buffer.readUInt32BE(4);
    const command = buffer.readUInt32BE(8);
    const length = buffer.readUInt32BE(12);
    const payload = buffer.slice(16, 16 + length);
    
    return {
      prefix,
      sequence,
      command,
      length,
      payload
    };
  }
}

// Añadir propiedades para que SignalRGB lo ignore
TuyaPacket.VendorId = VendorId;
TuyaPacket.ProductId = ProductId;

module.exports = TuyaPacket;
