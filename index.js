/**
 * Plugin principal para SignalRGB - Tuya LED Controller
 * @author BKMEN
 * @version 2.0.1 (Refactored based on fu-raz structure)
 */

// CAMBIAR: ES6 imports por CommonJS requires
const TuyaDiscoveryServiceInternal = require('./comms/Discovery.js');
const TuyaController = require('./TuyaController.js');
const TuyaDeviceModel = require('./models/TuyaDeviceModel.js');
const DeviceList = require('./DeviceList.js');

// --- Metadatos del Plugin para SignalRGB ---
function Name() { return "Tuya LED Controller"; }
function Version() { return "2.0.1"; }
function Type() { return "network"; }
function Publisher() { return "BKMEN"; }
function Size() { return [1, 1]; }
function DefaultPosition() { return [240, 120]; }
function DefaultScale() { return 100; }
function DefaultComponentBrand() { return "Tuya"; }
function VendorId() { return 0x2833; }
function ProductId() { return 0x1337; }

function ControllableParameters() {
    return [
        { property: "debugMode", group: "settings", label: "Debug Mode", type: "boolean", default: false },
        { property: "discoveryTimeout", group: "settings", label: "Discovery Timeout (ms)", type: "int", min: 1000, max: 30000, default: 5000 }
    ];
}
// --- Variables Globales del Plugin ---
let controllers = [];
let globalDebugMode = false;
let globalDiscoveryTimeout = 5000;

// CORREGIR: Simplificar manejo de service
if (typeof service === 'undefined') {
    global.service = { log: console.log };
}

// --- Funciones del Ciclo de Vida del Plugin Principal ---

function Initialize() {
    try {
        service.log("Initializing Tuya LED Controller Plugin v2.0.1");

        // Configurar el objeto service para QML
        service.controllers = controllers;
        service.getDevices = () => controllers;
        service.startDiscovery = () => {
            service.log("QML requested discovery");
            if (!discoveryServiceInstance) {
                service.log("DiscoveryService instance missing, creating...");
                discoveryServiceInstance = new DiscoveryService();
                if (typeof discoveryServiceInstance.Initialize === 'function') {
                    discoveryServiceInstance.Initialize();
                }
            }
            if (discoveryServiceInstance && typeof discoveryServiceInstance.Start === 'function') {
                discoveryServiceInstance.Start();
            }
        };
        service.initialize = function() {
            service.log("Service (QML interface) initialized from QML");
        };
        service.deviceTypes = (typeof DeviceList.getDeviceTypes === 'function') ? DeviceList.getDeviceTypes() : [];

        // Funciones de callback para QML
        service.deviceConfigured = (deviceId) => {
            service.log('Device configured: ' + deviceId);
        };
        service.deviceError = (deviceId, error) => {
            service.log(`Device error ${deviceId}: ${error}`);
        };
        service.negotiationComplete = (deviceId) => {
            service.log(`Negotiation complete for device: ${deviceId}`);
        };
        service.discoveryComplete = () => {
            service.log("Discovery process completed");
        };

        loadSavedDevices();

        service.log("Plugin initialized successfully.");
    } catch (error) {
        service.log("Error initializing plugin: " + error.message);
        if (error.stack) service.log(error.stack);
        throw error;
    }
}
function PluginUIPath() {
    return "ui/TuyaUI.qml"; // o simplemente "TuyaUI.qml" si está en la raíz
}

// CORREGIR: Render debe recibir device como parámetro
function Render(device) {
    try {
        controllers.forEach(controllerInstance => {
            if (controllerInstance.device && controllerInstance.device.isReady()) {
                const ledColors = [];
                const ledCount = controllerInstance.device.ledCount || 1;

                // USAR: device pasado como parámetro
                if (device && typeof device.getLed === 'function') {
                    if (ledCount === 1) {
                        const color = device.getLed(0);
                        ledColors.push({ r: color[0], g: color[1], b: color[2] });
                    } else {
                        const baseColor = device.getLed(0);
                        for (let i = 0; i < ledCount; i++) {
                            ledColors.push({ r: baseColor[0], g: baseColor[1], b: baseColor[2] });
                        }
                    }
                }

                if (ledColors.length > 0) {
                    controllerInstance.setColor(ledColors);
                }
            }
        });
    } catch (error) {
        service.log("Error in Render: " + error.message);
        if (error.stack) service.log(error.stack);
    }
}

function onParameterChange(parameterName, value) {
    service.log(`Parameter changed: ${parameterName} = ${value}`);
    switch (parameterName) {
        case "debugMode":
            globalDebugMode = value;
            if (discoveryServiceInstance) {
                discoveryServiceInstance.debugMode = value;
            }
            controllers.forEach(c => {
                if(c.device) c.device.debugMode = value;
                if(c.negotiator) c.negotiator.debugMode = value;
            });
            break;
        case "discoveryTimeout":
            globalDiscoveryTimeout = value;
            if (discoveryServiceInstance) {
                discoveryServiceInstance.timeout = value;
            }
            break;
    }
}

function Shutdown(SystemSuspending) {
    try {
        service.log("Shutting down Tuya LED Controller Plugin. System Suspending: " + SystemSuspending);
        controllers.forEach(controller => {
            if (SystemSuspending) {
                // Opcional: apagar LEDs al suspender sistema
            }
            if (typeof controller.cleanup === 'function') {
                controller.cleanup();
            }
        });

        if (discoveryServiceInstance) {
            if (typeof discoveryServiceInstance.Stop === 'function') {
                discoveryServiceInstance.Stop();
            } else if (typeof discoveryServiceInstance.stopDiscovery === 'function') {
                discoveryServiceInstance.stopDiscovery();
            }
            discoveryServiceInstance = null;
        }
        controllers = [];
        service.log("Plugin shutdown complete.");
    } catch (error) {
        service.log("Error during shutdown: " + error.message);
        if (error.stack) service.log(error.stack);
    }
}

function Validate(endpoint) {
    return endpoint.interface === 0;
}

// --- Servicio de Descubrimiento ---
let discoveryServiceInstance = null;

class DiscoveryService {
    constructor() {
        service.log("Tuya DiscoveryService constructor called.");
        this.internalDiscovery = null;
        this.negotiatorInstances = new Map();
        discoveryServiceInstance = this;
    }

    Initialize() {
        service.log("Tuya DiscoveryService: Initialize method called.");
        try {
            this.internalDiscovery = new TuyaDiscoveryServiceInternal({
                debugMode: globalDebugMode,
                timeout: globalDiscoveryTimeout
            });

            this.internalDiscovery.on('device_found', (deviceData) => {
                this.handleTuyaDiscovery(deviceData);
            });
            this.internalDiscovery.on('error', (error) => {
                service.log('DiscoveryService Internal Error: ' + error.message);
            });
            this.internalDiscovery.on('started', () => {
                service.log('DiscoveryService Internal: Discovery started.');
            });
            this.internalDiscovery.on('stopped', () => {
                service.log("DiscoveryService Internal: Discovery stopped.");
                if (typeof service.discoveryComplete === 'function') {
                    service.discoveryComplete();
                }
            });

            service.log("Tuya DiscoveryService internal components initialized.");
        } catch (e) {
            service.log("Error in DiscoveryService.Initialize: " + e.message);
            if (e.stack) service.log(e.stack);
        }
    }

    handleTuyaDiscovery(deviceData) {
        service.log(`DiscoveryService: Handling discovered device: ${deviceData.id || deviceData.gwId}`);
        try {
            const deviceId = deviceData.id || deviceData.gwId;
            if (!deviceId) {
                service.log("Discovered device has no ID. Skipping.");
                return;
            }

            let existingController = controllers.find(c => c.device.id === deviceId);

            if (existingController) {
                service.log(`Device ${deviceId} already exists. Updating info.`);
                existingController.device.updateFromDiscovery(deviceData);
                if (!existingController.device.isReady() && existingController.device.localKey && existingController.device.enabled) {
                    service.log(`Re-initiating negotiation for existing device: ${deviceId}`);
                    existingController.startNegotiation();
                }
            } else {
                service.log(`Creating new controller for ${deviceId}`);
                const newDeviceModel = new TuyaDeviceModel(deviceData);

                const newController = new TuyaController(newDeviceModel);
                controllers.push(newController);
                service.controllers = controllers;

                service.log('New device added to controllers list: ' + newDeviceModel.id);
                saveDeviceList();

                if (newDeviceModel.localKey && newDeviceModel.enabled) {
                    service.log(`Attempting negotiation for new device: ${newDeviceModel.id}`);
                    newController.startNegotiation();
                } else {
                    service.log(`Device ${newDeviceModel.id} needs configuration (LocalKey/Enabled).`);
                }
            }
        } catch (error) {
            service.log('Error in handleTuyaDiscovery: ' + error.message);
            if (error.stack) service.log(error.stack);
        }
    }

    Update(force) {
        controllers.forEach(controller => {
            if (controller.negotiator && typeof controller.negotiator.handleQueue === 'function') {
                // controller.negotiator.handleQueue(Date.now());
            }
        });
    }

    Start() {
        service.log("DiscoveryService: Start method called by SignalRGB.");
        if (this.internalDiscovery) {
            this.internalDiscovery.startDiscovery();
        } else {
            service.log("DiscoveryService: Internal discovery not initialized. Call Initialize first.");
        }
    }

    Stop() {
        service.log("DiscoveryService: Stop method called by SignalRGB.");
        if (this.internalDiscovery) {
            this.internalDiscovery.stopDiscovery();
        }
    }
}

// --- Funciones Auxiliares ---

function loadSavedDevices() {
    try {
        const savedDeviceIdsJson = service.getSetting('tuyaDevices', 'deviceList', '[]');
        const deviceIds = JSON.parse(savedDeviceIdsJson);
        
        service.log(`Found ${deviceIds.length} saved device IDs.`);
        let loadedCount = 0;

        deviceIds.forEach(deviceId => {
            const configData = service.getSetting(deviceId, 'configData', '{}');
            const config = JSON.parse(configData);
            
            if (config.id) {
                if (!controllers.find(c => c.device.id === config.id)) {
                    const deviceModel = new TuyaDeviceModel(config);
                    const controller = new TuyaController(deviceModel);
                    controllers.push(controller);
                    loadedCount++;
                    
                    if (deviceModel.enabled && deviceModel.localKey && !deviceModel.isReady()) {
                        service.log(`Attempting negotiation for saved device: ${deviceModel.id}`);
                        try {
                            controller.startNegotiation();
                        } catch (negErr) {
                            service.log('Negotiation error for ' + deviceModel.id + ': ' + negErr.message);
                        }
                    }
                }
            }
        });

        service.controllers = controllers;
        service.log(`Loaded ${loadedCount} saved devices.`);
    } catch (error) {
        service.log('Error loading saved devices: ' + error.message);
        if (error.stack) service.log(error.stack);
    }
}

function saveDeviceList() {
    try {
        const ids = controllers.map(c => c.device.id);
        service.saveSetting('tuyaDevices', 'deviceList', JSON.stringify(ids));
        service.log('Device list saved.');
    } catch (error) {
        service.log('Error saving device list: ' + error.message);
        if (error.stack) service.log(error.stack);
    }
}

module.exports = {
    Name,
    Version,
    Type,
    Publisher,
    Size,
    DefaultPosition,
    DefaultScale,
    DefaultComponentBrand,
    VendorId,
    ProductId,
    ControllableParameters,
    Initialize,
    Render,
    Shutdown,
    Validate,
    onParameterChange,
    DiscoveryService,
    PluginUIPath
};


