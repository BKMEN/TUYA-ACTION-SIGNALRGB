/**
 * TuyaController.js
 * Controlador central para gestionar dispositivos Tuya
 */

const EventEmitter = require('events');

// Importa TuyaDevice correctamente
const TuyaDevice = require('./TuyaDevice');

// Crear clase TuyaController que extiende EventEmitter
function TuyaController(options) {
    // Llamar al constructor de EventEmitter (padre)
    EventEmitter.call(this);
    
    // Opciones por defecto
    options = options || {};
    
    // Evitar uso de spread y sintaxis avanzada
    this.options = {};
    this.options.discoveryTimeout = options.discoveryTimeout || 10000;
    this.options.autoReconnect = options.autoReconnect !== false;
    this.options.reconnectInterval = options.reconnectInterval || 30000;
    
    // Estado del controlador
    this.isDiscovering = false;
    this.isInitialized = false;
    
    // Colección de dispositivos
    this.devices = new Map();
    
    // Instancia del descubridor de dispositivos
    this.discovery = null; // Inicializar en initialize
    
    // Intervalo de reconexión
    this.reconnectInterval = null;
    
    // Bindear métodos
    this._handleDeviceDiscovered = this._handleDeviceDiscovered.bind(this);
}

// Heredar de EventEmitter
TuyaController.prototype = Object.create(EventEmitter.prototype);
TuyaController.prototype.constructor = TuyaController;

// Métodos de la clase
TuyaController.prototype.initialize = async function() {
    if (this.isInitialized) {
        return;
    }
    
    // Configurar escuchadores de eventos para discovery
    this.discovery.on('device-discovered', this._handleDeviceDiscovered);
    
    // Cargar dispositivos guardados
    await this._loadSavedDevices();
    
    // Iniciar reconexión automática si está habilitada
    if (this.options.autoReconnect) {
        this._startReconnectInterval();
    }
    
    this.isInitialized = true;
    this.emit('initialized');
    
    return this;
};

TuyaController.prototype.shutdown = async function() {
    // Detener reconexión automática
    this._stopReconnectInterval();
    
    // Desconectar todos los dispositivos
    for (const device of this.devices.values()) {
        device.disconnect();
    }
    
    // Detener discovery
    if (this.isDiscovering) {
        await this.stopDiscovery();
    }
    
    // Remover listeners
    this.discovery.removeAllListeners();
    
    this.isInitialized = false;
    this.emit('shutdown');
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