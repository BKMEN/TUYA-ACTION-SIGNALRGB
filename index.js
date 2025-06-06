/**
 * Plugin principal para SignalRGB - Tuya LED Controller
 * @author BKMEN
 * @version 2.0.1 (Refactored based on fu-raz structure)
 */

// Cargar dependencias usando CommonJS para compatibilidad con SignalRGB
const TuyaDiscoveryServiceInternal = require('./comms/Discovery.js');
const TuyaController = require('./TuyaController.js');
const TuyaDeviceModel = require('./models/TuyaDeviceModel.js');
const DeviceList = require('./DeviceList.js');
const service = require('./service.js');

// Optional filesystem access if available (Node environments)
let fs;
try {
    if (typeof require !== 'undefined') {
        fs = require('fs');
    }
} catch (e) {
    fs = undefined;
}

// --- Metadatos del Plugin para SignalRGB ---
function Name() { return "Tuya LED Controller"; }
function Version() { return "2.0.1"; }
function Type() { return "network"; }
function Publisher() { return "BKMEN"; }
function Size() { return [1, 1]; }
function DefaultPosition() { return [240, 120]; }
function DefaultScale() { return 1.0; }
function DefaultComponentBrand() { return "Tuya"; }
function VendorId() { return 0x2833; }
function ProductId() { return 0x1337; }

// Devuelve lista de nombres de LEDs para mapeo en SignalRGB
function LedNames(controller) {
    const count = (controller && controller.device && controller.device.ledCount) || 1;
    const names = [];
    for (let i = 0; i < count; i++) {
        names.push(`LED ${i + 1}`);
    }
    return names;
}

// Devuelve posiciones relativas simples para los LEDs
function LedPositions(controller) {
    const count = (controller && controller.device && controller.device.ledCount) || 1;
    const positions = [];
    for (let i = 0; i < count; i++) {
        positions.push([i, 0]);
    }
    return positions;
}

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



// --- Funciones del Ciclo de Vida del Plugin Principal ---

function Initialize() {
    if (typeof service === 'undefined' || typeof service.log !== 'function') {
        console.log("❌ Error: 'service' no está disponible o no es válido.");
        return;
    }
    try {
        service.log("Initializing Tuya LED Controller Plugin v2.0.1");
        service.log("🧪 PluginUIPath = " + PluginUIPath());

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
        service.controllersChanged = () => {
            service.log("Controllers changed event emitted");
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
    // UI principal ubicado en la raíz del proyecto
    return "TuyaUI.qml";
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
                    for (let i = 0; i < ledCount; i++) {
                        const c = device.getLed(i);
                        ledColors.push({ r: c[0], g: c[1], b: c[2] });
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
                // Optional: persist discovered devices for debugging if fs is available
                try {
                    if (typeof fs !== 'undefined' && fs.appendFileSync) {
                        fs.appendFileSync('devices_found.json', JSON.stringify(deviceData, null, 2) + ',\n');
                    }
                } catch (e) {
                    service.log('Error writing devices_found.json: ' + e.message);
                }
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
        if (!deviceData) {
            service.log('DiscoveryService: handleTuyaDiscovery called with undefined data');
            return;
        }

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
                if (typeof service.controllersChanged === 'function') {
                    service.controllersChanged();
                }
            } else {
                service.log(`Creating new controller for ${deviceId}`);
                const newDeviceModel = new TuyaDeviceModel(deviceData);
                if (!newDeviceModel) {
                    service.log('DiscoveryService: failed to initialize TuyaDeviceModel');
                    return;
                }
                service.log(`Estado del dispositivo: enabled=${newDeviceModel.enabled}, localKey=${newDeviceModel.localKey}`);

                const newController = new TuyaController(newDeviceModel);
                controllers.push(newController);
                service.controllers = controllers;
                if (typeof service.addController === 'function') {
                    try {
                        service.addController(newController);
                        console.log(`✅ Controlador registrado: ${newController.device.name}`);
                        // Temporarily announce controller regardless of enabled flag
                        if (/* newDeviceModel.enabled && */ typeof service.announceController === 'function') {
                            service.announceController(newController);
                        }
                    } catch (addErr) {
                        service.log('addController error: ' + addErr.message);
                    }
                }
                if (typeof service.controllersChanged === 'function') {
                    service.controllersChanged();
                }

                if (typeof service.deviceDiscovered === 'function') {
                    try {
                        service.deviceDiscovered(newDeviceModel.id, newDeviceModel.ip, newDeviceModel.localKey || '');
                    } catch (ddErr) {
                        service.log('deviceDiscovered error: ' + ddErr.message);
                    }
                }

                service.log('New device added to controllers list: ' + newDeviceModel.id);
                saveDeviceList();

                // Temporarily start negotiation regardless of LocalKey/Enabled state
                if (/* newDeviceModel.localKey && newDeviceModel.enabled */ true) {
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
            this.internalDiscovery.startDiscovery()
                .then(() => {
                    service.log("DiscoveryService: Sending discovery request");
                    return this.internalDiscovery.sendDiscoveryRequest();
                })
                .then(() => {
                    service.log("DiscoveryService: Discovery request sent");
                })
                .catch((err) => {
                    service.log('DiscoveryService Start error: ' + err.message);
                });
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
                    const deviceModel = new TuyaDeviceModel(config || {});
                    if (!deviceModel) {
                        service.log('loadSavedDevices: failed to init device model for ' + deviceId);
                        return;
                    }
                    const controller = new TuyaController(deviceModel);
                    controllers.push(controller);
                    service.log(`Loaded device ${deviceModel.id}: enabled=${deviceModel.enabled}, localKey=${deviceModel.localKey}`);
                    loadedCount++;
                    if (!deviceModel.localKey) {
                        service.log('Warning: no localKey stored for ' + deviceModel.id);
                    }
                    
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
        if (typeof service.controllersChanged === 'function') {
            service.controllersChanged();
        }
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
    LedNames,
    LedPositions,
    ControllableParameters,
    Initialize,
    Render,
    Shutdown,
    Validate,
    onParameterChange,
    DiscoveryService,
    PluginUIPath
};


