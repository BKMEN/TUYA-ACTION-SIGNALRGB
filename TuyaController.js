/**
 * TuyaController.js
 * Controlador central para gestionar dispositivos Tuya
 */

var EventEmitter = require('events');
var util = require('util');

// Importa TuyaDevice correctamente
var TuyaDevice = require('./TuyaDevice');

// Función constructora para TuyaController (versión más simple)
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
    reconnectInterval: options.reconnectInterval || 30000
  };
  
  this.isDiscovering = false;
  this.isInitialized = false;
  this.devices = new Map();
  this.discovery = null;
  this.reconnectInterval = null;
  
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
  
  // Código simplificado para evitar errores
  if (this.discovery) {
    this.discovery.on('device-discovered', this._handleDeviceDiscovered);
  }
  
  return Promise.resolve(this);
};

// Shutdown
TuyaController.prototype.shutdown = function() {
  if (this.reconnectInterval) {
    clearInterval(this.reconnectInterval);
    this.reconnectInterval = null;
  }
  
  // Desconectar todos los dispositivos
  var devices = this.devices.values();
  for (var device of devices) {
    device.disconnect();
  }
  
  // Detener discovery
  if (this.isDiscovering && this.discovery) {
    this.discovery.stop();
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
    const device = new TuyaDevice(deviceInfo);
    this.devices.set(device.id, device);
    
    // Emitir evento de dispositivo añadido
    this.emit('device-added', device);
    
    // Intentar conectar el dispositivo
    this._connectDevice(device).catch(error => {
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

module.exports = TuyaController;