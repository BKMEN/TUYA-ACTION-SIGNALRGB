/**
 * TuyaDevice.js
 * Representa un dispositivo Tuya individual y maneja su comunicación
 */

const EventEmitter = require('events');
const dgram = require('dgram');

// Crear clase TuyaDevice que extiende EventEmitter usando patrón compatible
function TuyaDevice(deviceInfo) {
    // Llamar al constructor de EventEmitter (padre)
    EventEmitter.call(this);
    
    // Asegurarse de que deviceInfo esté definido
    deviceInfo = deviceInfo || {};
    
    // Inicializa propiedades sin sintaxis avanzada
    this.id = deviceInfo.id || '';
    this.ip = deviceInfo.ip || '';
    this.key = deviceInfo.key || '';
    this.version = deviceInfo.version || '3.3';
    this.name = deviceInfo.name || 'Tuya Device';
    this.productId = deviceInfo.productId || '';
    
    // Estado del dispositivo
    this.connected = false;
    this.online = false;
    this.ledCount = deviceInfo.ledCount || 72;
    this.maxLedCount = 300;
    this.currentColors = [];
    this.brightness = 100;
}

// Heredar de EventEmitter
TuyaDevice.prototype = Object.create(EventEmitter.prototype);
TuyaDevice.prototype.constructor = TuyaDevice;

// Métodos de la clase
TuyaDevice.prototype.connect = function() {
    this.connected = true;
    this.emit('connected');
    return Promise.resolve();
};

TuyaDevice.prototype.disconnect = function() {
    this.connected = false;
    this.emit('disconnected');
    return Promise.resolve();
};

TuyaDevice.prototype.setColors = function(colors) {
    // Implementación simplificada
    this.currentColors = colors;
    this.emit('colors-changed', colors);
    return Promise.resolve();
};

TuyaDevice.prototype.setLedCount = function(count) {
    if (count < 1 || count > this.maxLedCount) {
        return Promise.reject(new Error(`Invalid LED count: ${count}. Must be between 1 and ${this.maxLedCount}`));
    }
    
    this.ledCount = count;
    this.emit('led-count-changed', count);
    return Promise.resolve();
};

module.exports = TuyaDevice;