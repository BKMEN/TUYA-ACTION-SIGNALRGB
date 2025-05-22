/**
 * TuyaController.js
 * Controlador central para gestionar dispositivos Tuya
 */

var EventEmitter = require('events');
var util = require('util');
var dgram = require('dgram');
var crypto = require('crypto');

// Importaciones de módulos locales
var TuyaDevice = require('./TuyaDevice');
var TuyaPacket = require('./TuyaPacket');
var TuyaEncryption = require('./utils/TuyaEncryption');

// Función constructora para TuyaController
function TuyaController(options) {
  // Verificar instancia
  if (!(this instanceof TuyaController)) {
    return new TuyaController(options);
  }
  
  // Llamar al constructor padre
  EventEmitter.call(this);
  
  // Opciones con sintaxis básica para evitar errores
  options = options || {};
  
  this.options = {
    discoveryTimeout: options.discoveryTimeout || 10000,
    autoReconnect: options.autoReconnect !== false,
    reconnectInterval: options.reconnectInterval || 30000,
    commandPort: options.commandPort || 40001,
    discoveryPort: options.discoveryPort || 6667
  };
  
  this.isDiscovering = false;
  this.isInitialized = false;
  this.devices = new Map();
  this.discovery = null;
  this.reconnectInterval = null;
  this.broadcastSocket = null;
  
  // Bindear métodos con sintaxis compatible
  var self = this;
  this._handleDeviceDiscovered = function(deviceInfo) {
    return self._processDiscoveredDevice(deviceInfo);
  };
}

// Heredar de EventEmitter con método antiguo
util.inherits(TuyaController, EventEmitter);

// Método interno para procesar dispositivos descubiertos
TuyaController.prototype._processDiscoveredDevice = function(deviceInfo) {
  var device = this.addDevice(deviceInfo);
  this.emit('device-discovered', device);
  return device;
};

// Inicialización
TuyaController.prototype.initialize = function() {
  var self = this;
  
  if (this.isInitialized) {
    return Promise.resolve(this);
  }
  
  // Inicializar el socket de broadcast
  this.broadcastSocket = dgram.createSocket('udp4');
  
  this.broadcastSocket.on('error', (error) => {
    this.emit('error', error);
    console.error('Broadcast socket error:', error);
  });
  
  this.broadcastSocket.on('message', (msg, rinfo) => {
    this._handleBroadcastResponse(msg, rinfo);
  });
  
  // Código simplificado para evitar errores
  if (this.discovery) {
    this.discovery.on('device-discovered', this._handleDeviceDiscovered);
  }
  
  this.isInitialized = true;
  
  // Si está configurado el reconectar automáticamente, iniciar el intervalo
  if (this.options.autoReconnect) {
    this._startReconnectionLoop();
  }
  
  return Promise.resolve(this);
};

// Método para manejar respuestas de broadcast
TuyaController.prototype._handleBroadcastResponse = function(msg, rinfo) {
  try {
    const deviceId = TuyaPacket.parseDeviceId(msg);
    const device = this.getDevice(deviceId);
    
    if (device) {
      device.handleResponse(msg, rinfo);
    } else {
      console.log('Received message for unknown device:', deviceId);
    }
  } catch (error) {
    console.error('Error handling broadcast response:', error);
    this.emit('error', error);
  }
};

// Iniciar loop de reconexión
TuyaController.prototype._startReconnectionLoop = function() {
  if (this.reconnectInterval) {
    clearInterval(this.reconnectInterval);
  }
  
  var self = this;
  this.reconnectInterval = setInterval(function() {
    const devices = Array.from(self.devices.values());
    devices.forEach(device => {
      if (!device.isConnected) {
        device.connect().catch(error => {
          console.error(`Reconnection attempt failed for ${device.id}:`, error);
        });
      }
    });
  }, this.options.reconnectInterval);
};

// Shutdown
TuyaController.prototype.shutdown = function() {
  if (this.reconnectInterval) {
    clearInterval(this.reconnectInterval);
    this.reconnectInterval = null;
  }
  
  // Desconectar todos los dispositivos
  var devices = Array.from(this.devices.values());
  for (var device of devices) {
    device.disconnect();
  }
  
  // Detener discovery
  if (this.isDiscovering && this.discovery) {
    this.discovery.stop();
  }
  
  // Cerrar socket de broadcast
  if (this.broadcastSocket) {
    this.broadcastSocket.close();
    this.broadcastSocket = null;
  }
  
  // Remover listeners
  if (this.discovery) {
    this.discovery.removeAllListeners();
  }
  
  this.isInitialized = false;
  this.emit('shutdown');
  
  return Promise.resolve();
};

TuyaController.prototype.startDiscovery = async function(options = {}) {
    if (this.isDiscovering) {
        return;
    }
    
    const timeout = options.timeout || this.options.discoveryTimeout;
    
    this.isDiscovering = true;
    this.emit('discovery-started');
    
    try {
        await this.discovery.start();
        
        // Configurar temporizador para detener el descubrimiento
        return new Promise((resolve) => {
            setTimeout(async () => {
                await this.stopDiscovery();
                resolve();
            }, timeout);
        });
        
    } catch (error) {
        this.isDiscovering = false;
        this.emit('error', error);
        throw error;
    }
};

TuyaController.prototype.stopDiscovery = async function() {
    if (!this.isDiscovering) {
        return;
    }
    
    try {
        await this.discovery.stop();
    } catch (error) {
        this.emit('error', error);
    }
    
    this.isDiscovering = false;
    this.emit('discovery-stopped');
};

TuyaController.prototype.addDevice = function(deviceInfo) {
    if (!deviceInfo.id) {
        throw new Error('Device ID is required');
    }
    
    // Si el dispositivo ya existe, actualizarlo
    if (this.devices.has(deviceInfo.id)) {
        const existingDevice = this.devices.get(deviceInfo.id);
        existingDevice.ip = deviceInfo.ip || existingDevice.ip;
        existingDevice.key = deviceInfo.key || existingDevice.key;
        existingDevice.name = deviceInfo.name || existingDevice.name;
        return existingDevice;
    }
    
    // Crear nuevo dispositivo
    const device = new TuyaDevice({
        id: deviceInfo.id,
        ip: deviceInfo.ip,
        key: deviceInfo.key,
        name: deviceInfo.name,
        version: deviceInfo.version || '3.5',
        port: this.options.commandPort,
        controller: this
    });
    
    this.devices.set(device.id, device);
    
    // Escuchar eventos del dispositivo
    device.on('connected', () => {
        this.emit('device-connected', device);
    });
    
    device.on('disconnected', () => {
        this.emit('device-disconnected', device);
    });
    
    device.on('error', (error) => {
        this.emit('device-error', device, error);
    });
    
    device.on('data', (data) => {
        this.emit('device-data', device, data);
    });
    
    // Emitir evento de dispositivo añadido
    this.emit('device-added', device);
    
    // Intentar conectar el dispositivo
    device.connect().catch(error => {
        console.error(`Failed to connect device ${device.id}:`, error);
    });
    
    return device;
};

TuyaController.prototype.removeDevice = function(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
        return false;
    }
    
    // Desconectar dispositivo
    device.disconnect();
    
    // Eliminar de la colección
    this.devices.delete(deviceId);
    
    // Emitir evento de dispositivo eliminado
    this.emit('device-removed', deviceId);
    
    return true;
};

TuyaController.prototype.getDevice = function(deviceId) {
    return this.devices.get(deviceId) || null;
};

TuyaController.prototype.getAllDevices = function() {
    return Array.from(this.devices.values());
};

TuyaController.prototype.setDeviceColors = async function(deviceId, colors) {
    const device = this.getDevice(deviceId);
    if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
    }
    
    try {
        await device.setColors(colors);
        this.emit('colors-updated', deviceId, colors);
        return true;
    } catch (error) {
        this.emit('error', error);
        throw error;
    }
};

TuyaController.prototype.setDeviceLedCount = async function(deviceId, count) {
    const device = this.getDevice(deviceId);
    if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
    }
    
    try {
        await device.setLedCount(count);
        this.emit('led-count-updated', deviceId, count);
        return true;
    } catch (error) {
        this.emit('error', error);
        throw error;
    }
};

// Método para enviar un paquete por broadcast a un dispositivo
TuyaController.prototype.sendUdpPacket = function(packet, ip, port) {
    if (!this.broadcastSocket) {
        throw new Error('Broadcast socket not initialized');
    }
    
    return new Promise((resolve, reject) => {
        this.broadcastSocket.send(packet, 0, packet.length, port || this.options.commandPort, ip, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
};

// Método para obtener la dirección IP de broadcast
TuyaController.prototype.getBroadcastAddress = function(ipAddress) {
    // Convertir la dirección IP a broadcast (cambiar el último octeto a 255)
    const ipParts = ipAddress.split('.');
    ipParts[3] = '255';
    return ipParts.join('.');
};

module.exports = TuyaController;