/**
 * Plugin principal para SignalRGB - Tuya LED Controller
 * @author BKMEN
 * @version 2.0.0
 */

import TuyaDiscovery from './comms/Discovery.js';
import TuyaController from './TuyaController.js';
import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import DeviceList from './DeviceList.js';

// Información del plugin para SignalRGB
export const Name = "Tuya LED Controller";
export const Version = "2.0.0";
export const Type = "network";
export const Publisher = "BKMEN";
export const Size = [1, 1];
export const DefaultPosition = [240, 120];
export const DefaultScale = 100;
export const DefaultComponentBrand = "Tuya";
export const VendorId = 0x2833;
export const ProductId = 0x1337;

// Solo parámetros globales
export const ControllableParameters = [
    { property: "debugMode", group: "settings", label: "Debug Mode", type: "boolean", default: false },
    { property: "discoveryTimeout", group: "settings", label: "Discovery Timeout (ms)", type: "int", min: 1000, max: 30000, default: 5000 }
];

// Variables globales del plugin
let discoveryService = null;
let controllers = [];
let debugMode = false;
let discoveryTimeout = 5000;

export function Initialize() {
    try {
        service.log("Initializing Tuya LED Controller Plugin v2.0.0");
        
        // Inicializar servicio de descubrimiento
        discoveryService = new TuyaDiscovery({ 
            debugMode: debugMode,
            timeout: discoveryTimeout 
        });
        
        // Configurar eventos de descubrimiento
        discoveryService.on('deviceDiscovered', handleDeviceDiscovered);
        discoveryService.on('error', handleDiscoveryError);
        discoveryService.on('discoveryStopped', () => {
            if (typeof service.discoveryComplete === 'function') {
                service.discoveryComplete();
            }
        });
        
        // Exponer para QML
        global.service = global.service || {};
        global.service.controllers = controllers;
        global.service.startDiscovery = startDiscovery;
        global.service.initialize = initializeService;
        global.service.deviceTypes = DeviceList.getDeviceTypes();
        
        // Eventos para QML
        global.service.deviceConfigured = (deviceId) => {
            service.log('Device configured: ' + deviceId);
        };
        
        global.service.deviceError = (deviceId, error) => {
            service.log(`Device error ${deviceId}: ${error}`);
        };
        
        global.service.negotiationComplete = (deviceId) => {
            service.log(`Negotiation complete for device: ${deviceId}`);
        };
        
        global.service.discoveryComplete = () => {
            service.log("Discovery process completed");
        };
        
        // Cargar dispositivos guardados
        loadSavedDevices();
        
        service.log("Plugin initialized successfully");
        
    } catch (error) {
        service.log("Error initializing plugin: " + error.message);
        throw error;
    }
}

export function Render() {
    // Enviar colores de SignalRGB a dispositivos conectados
    try {
        controllers.forEach(controller => {
            if (controller.device && controller.device.isReady()) {
                // Obtener colores de SignalRGB
                const ledColors = [];
                const ledCount = controller.device.ledCount || 1;
                
                for (let i = 0; i < ledCount; i++) {
                    if (device && typeof device.getLed === 'function') {
                        const color = device.getLed(i);
                        ledColors.push({
                            r: color[0],
                            g: color[1], 
                            b: color[2]
                        });
                    }
                }
                
                if (ledColors.length > 0) {
                    controller.setColor(ledColors);
                }
            }
        });
    } catch (error) {
        service.log("Error in Render: " + error.message);
    }
}

export function onParameterChange(parameterName, value) {
    switch (parameterName) {
        case "debugMode":
            debugMode = value;
            if (discoveryService) {
                discoveryService.debugMode = value;
            }
            break;
        case "discoveryTimeout":
            discoveryTimeout = value;
            break;
    }
}

export function Shutdown() {
    try {
        service.log("Shutting down Tuya LED Controller Plugin");
        
        controllers.forEach(controller => {
            if (typeof controller.cleanup === 'function') {
                controller.cleanup();
            }
        });
        
        if (discoveryService) {
            discoveryService.stopDiscovery();
        }
        
        service.log("Plugin shutdown complete");
        
    } catch (error) {
        service.log("Error during shutdown: " + error.message);
    }
}

export function DiscoveryService() {
    startDiscovery();
}

function startDiscovery() {
    if (discoveryService) {
        discoveryService.startDiscovery();
    }
}

function initializeService() {
    service.log("Service initialized from QML");
}

function handleDeviceDiscovered(deviceData) {
    try {
        const existing = controllers.find(c => c.device.id === deviceData.id);
        if (existing) {
            existing.device.updateFromDiscovery(deviceData);
            return;
        }

        const device = new TuyaDeviceModel(deviceData);
        const controller = new TuyaController(device);
        
        controllers.push(controller);
        
        service.log('New device added: ' + device.id);
        
        saveDeviceList();
        
        if (device.localKey && device.enabled) {
            controller.startNegotiation();
        }
        
    } catch (error) {
        service.log('Error handling discovered device: ' + error.message);
    }
}

function handleDiscoveryError(error) {
    service.log('Discovery error: ' + error.message);
    if (typeof service.deviceError === 'function') {
        service.deviceError('discovery', error.message);
    }
}

function loadSavedDevices() {
    try {
        const savedDeviceIds = service.getSetting('tuyaDevices', 'deviceList', '[]');
        const deviceIds = JSON.parse(savedDeviceIds);
        
        deviceIds.forEach(deviceId => {
            const configData = service.getSetting(deviceId, 'configData', '{}');
            const config = JSON.parse(configData);
            
            if (config.id) {
                const device = new TuyaDeviceModel(config);
                const controller = new TuyaController(device);
                controllers.push(controller);
                
                if (device.enabled && device.localKey) {
                    controller.startNegotiation();
                }
            }
        });
        
        service.log('Loaded ' + controllers.length + ' saved devices');
        
    } catch (error) {
        service.log('Error loading saved devices: ' + error.message);
    }
}

function saveDeviceList() {
    try {
        const deviceIds = controllers.map(c => c.device.id);
        service.saveSetting('tuyaDevices', 'deviceList', JSON.stringify(deviceIds));
    } catch (error) {
        service.log('Error saving device list: ' + error.message);
    }
}

export function Validate(endpoint) {
    return endpoint.interface === 0;
}