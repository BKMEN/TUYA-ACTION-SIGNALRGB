/**
 * TuyaController.js
 * Controlador central para gestionar todos los dispositivos Tuya
 */

const TuyaDevice = require('./TuyaDevice');
const TuyaDiscovery = require('./TuyaDiscovery');
const EventEmitter = require('events');

class TuyaController extends EventEmitter {
    /**
     * Constructor del controlador Tuya
     * @param {Object} options - Opciones de configuración
     */
    constructor(options = {}) {
        super();
        
        // Opciones de configuración
        this.options = {
            discoveryTimeout: options.discoveryTimeout || 10000,
            autoReconnect: options.autoReconnect !== false,
            reconnectInterval: options.reconnectInterval || 30000,
            ...options
        };
        
        // Estado del controlador
        this.isDiscovering = false;
        this.isInitialized = false;
        
        // Colección de dispositivos
        this.devices = new Map();
        
        // Instancia del descubridor de dispositivos
        this.discovery = new TuyaDiscovery();
        
        // Intervalo de reconexión
        this.reconnectInterval = null;
        
        // Bindear métodos
        this._handleDeviceDiscovered = this._handleDeviceDiscovered.bind(this);
    }
    
    /**
     * Inicializa el controlador
     * @returns {Promise} Promesa que se resuelve cuando el controlador está inicializado
     */
    async initialize() {
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
    }
    
    /**
     * Cierra el controlador y libera recursos
     */
    async shutdown() {
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
    }
    
    /**
     * Inicia el descubrimiento de dispositivos en la red
     * @param {Object} options - Opciones para el descubrimiento
     * @returns {Promise} Promesa que se resuelve cuando finaliza el descubrimiento
     */
    async startDiscovery(options = {}) {
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
    }
    
    /**
     * Detiene el descubrimiento de dispositivos
     * @returns {Promise} Promesa que se resuelve cuando se detiene el descubrimiento
     */
    async stopDiscovery() {
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
    }
    
    /**
     * Añade manualmente un dispositivo
     * @param {Object} deviceInfo - Información del dispositivo
     * @returns {TuyaDevice} El dispositivo añadido
     */
    addDevice(deviceInfo) {
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
    }
    
    /**
     * Elimina un dispositivo
     * @param {String} deviceId - ID del dispositivo a eliminar
     * @returns {Boolean} true si se eliminó, false si no existía
     */
    removeDevice(deviceId) {
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
    }
    
    /**
     * Obtiene un dispositivo por su ID
     * @param {String} deviceId - ID del dispositivo
     * @returns {TuyaDevice|null} El dispositivo o null si no existe
     */
    getDevice(deviceId) {
        return this.devices.get(deviceId) || null;
    }
    
    /**
     * Obtiene todos los dispositivos
     * @returns {Array} Array de dispositivos
     */
    getAllDevices() {
        return Array.from(this.devices.values());
    }
    
    /**
     * Establece los colores para un dispositivo
     * @param {String} deviceId - ID del dispositivo
     * @param {Array} colors - Array de colores RGB
     * @returns {Promise} Promesa que se resuelve cuando se establecen los colores
     */
    async setDeviceColors(deviceId, colors) {
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
    }
    
    /**
     * Establece el número de LEDs para un dispositivo
     * @param {String} deviceId - ID del dispositivo
     * @param {Number} count - Número de LEDs
     * @returns {Promise} Promesa que se resuelve cuando se establece el número de LEDs
     */
    async setDeviceLedCount(deviceId, count) {
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
    }
    
    /**
     * Guarda la configuración de los dispositivos
     * @returns {Promise} Promesa que se resuelve cuando se guarda la configuración
     */
    async saveDevices() {
        const devicesToSave = Array.from(this.devices.values()).map(device => ({
            id: device.id,
            ip: device.ip,
            key: device.key,
            name: device.name,
            productId: device.productId,
            ledCount: device.ledCount
        }));
        
        try {
            // Guardar en localStorage o archivo según el entorno
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('tuya-devices', JSON.stringify(devicesToSave));
            } else {
                // Si estamos en un entorno Node.js, usar fs
                const fs = require('fs');
                fs.writeFileSync('./tuya-devices.json', JSON.stringify(devicesToSave, null, 2));
            }
            
            this.emit('devices-saved', devicesToSave);
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Carga dispositivos guardados previamente
     * @private
     * @returns {Promise} Promesa que se resuelve cuando se cargan los dispositivos
     */
    async _loadSavedDevices() {
        try {
            let savedDevices = [];
            
            // Cargar desde localStorage o archivo según el entorno
            if (typeof localStorage !== 'undefined') {
                const saved = localStorage.getItem('tuya-devices');
                if (saved) {
                    savedDevices = JSON.parse(saved);
                }
            } else {
                // Si estamos en un entorno Node.js, usar fs
                const fs = require('fs');
                try {
                    const data = fs.readFileSync('./tuya-devices.json', 'utf8');
                    savedDevices = JSON.parse(data);
                } catch (readError) {
                    // El archivo no existe o hay un error al leerlo
                    console.log('No saved devices found or error reading file');
                    return;
                }
            }
            
            // Añadir dispositivos cargados
            for (const deviceInfo of savedDevices) {
                this.addDevice(deviceInfo);
            }
            
            this.emit('devices-loaded', savedDevices);
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Maneja el evento de dispositivo descubierto
     * @private
     * @param {Object} deviceInfo - Información del dispositivo descubierto
     */
    _handleDeviceDiscovered(deviceInfo) {
        // Añadir o actualizar el dispositivo
        const device = this.addDevice(deviceInfo);
        
        // Emitir evento de dispositivo descubierto
        this.emit('device-discovered', device);
    }
    
    /**
     * Conecta un dispositivo
     * @private
     * @param {TuyaDevice} device - Dispositivo a conectar
     * @returns {Promise} Promesa que se resuelve cuando el dispositivo está conectado
     */
    async _connectDevice(device) {
        if (!device || device.connected) {
            return;
        }
        
        try {
            await device.connect();
            this.emit('device-connected', device.id);
            return true;
        } catch (error) {
            this.emit('device-connection-failed', device.id, error);
            return false;
        }
    }
    
    /**
     * Inicia el intervalo de reconexión para dispositivos desconectados
     * @private
     */
    _startReconnectInterval() {
        if (this.reconnectInterval) {
            return;
        }
        
        this.reconnectInterval = setInterval(() => {
            for (const device of this.devices.values()) {
                if (!device.connected) {
                    this._connectDevice(device).catch(() => {
                        // Intentos fallidos no requieren acción adicional
                    });
                }
            }
        }, this.options.reconnectInterval);
    }
    
    /**
     * Detiene el intervalo de reconexión
     * @private
     */
    _stopReconnectInterval() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
    }
}

module.exports = TuyaController;