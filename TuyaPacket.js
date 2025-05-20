/**
 * Utilidades para manejar paquetes del protocolo Tuya
 */

// Constantes
var MAGIC_PREFIX = 0x000055aa;
var MAGIC_SUFFIX = 0x0000aa55;

// Usar objeto simple para evitar errores de sintaxis con clases
var TuyaPacket = {};

// Método para crear paquetes
TuyaPacket.createPacket = function(command, payload, sequence) {
  // Implementación simplificada
  var bodyBuffer = Buffer.from(payload || '');
  var headerLength = 16;
  var buffer = Buffer.alloc(headerLength + bodyBuffer.length);
  
  buffer.writeUInt32BE(MAGIC_PREFIX, 0);
  buffer.writeUInt32BE(sequence || 0, 4);
  buffer.writeUInt32BE(command, 8);
  buffer.writeUInt32BE(bodyBuffer.length, 12);
  
  bodyBuffer.copy(buffer, headerLength);
  
  return buffer;
};

// Método para parsear paquetes
TuyaPacket.parsePacket = function(buffer) {
  if (buffer.length < 16) {
    return null;
  }
  
  var prefix = buffer.readUInt32BE(0);
  if (prefix !== MAGIC_PREFIX) {
    return null;
  }
  
  var sequence = buffer.readUInt32BE(4);
  var command = buffer.readUInt32BE(8);
  var length = buffer.readUInt32BE(12);
  var payload = buffer.slice(16, 16 + length);
  
  return {
    prefix: prefix,
    sequence: sequence,
    command: command,
    length: length,
    payload: payload
  };
};

module.exports = TuyaPacket;
