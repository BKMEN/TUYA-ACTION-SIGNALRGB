/**
 * Plugin principal para SignalRGB - Tuya LED Controller
 * @author BKMEN
 * @version 2.0.1 (Refactored based on fu-raz structure)
 */
'use strict';

// Cargar dependencias usando la sintaxis de import
import TuyaDiscoveryServiceInternal from './comms/Discovery.js';
import TuyaController from './TuyaController.js';
import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import DeviceList from './DeviceList.js';
import service from './service.js';

import logger from './utils/Logger.js';
let fs;
try {
    ({ default: fs } = await import('node:fs'));
} catch (e) {
    fs = undefined;
}

// ----------------------------------------------
// Helper logging functions with consistent style
// ----------------------------------------------
function logInfo(...msg) {
    logger.info(...msg);
    if (service && typeof service.log === 'function') {
        service.log('[TuyaPlugin]', ...msg);
    }
}

function logError(...msg) {
    logger.error(...msg);
    if (service && typeof service.log === 'function') {
        service.log('[TuyaPlugin]', ...msg);
    }
}


// --- Metadatos del Plugin para SignalRGB ---
export function Name() { return "Tuya LED Controller"; }
export function Version() { return "2.0.1"; }
export function Type() { return "network"; }
export function Publisher() { return "BKMEN"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() { return [240, 120]; }
export function DefaultScale() { return 1.0; }
export function DefaultComponentBrand() { return "Tuya"; }
export function VendorId() { return 0x2833; }
export function ProductId() { return 0x1337; }

// Devuelve lista de nombres de LEDs para mapeo en SignalRGB
export function LedNames(controller) {
    const count = (controller && controller.device && controller.device.ledCount) || 1;
    const names = [];
    for (let i = 0; i < count; i++) {
        names.push(`LED ${i + 1}`);
    }
    return names;
}

// Devuelve posiciones relativas simples para los LEDs
export function LedPositions(controller) {
    const count = (controller && controller.device && controller.device.ledCount) || 1;
    const positions = [];
    for (let i = 0; i < count; i++) {
        positions.push([i, 0]);
    }
    return positions;
}

export function ControllableParameters() {
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

export function Initialize() {
    if (typeof service === 'undefined' || typeof service.log !== 'function') {
        logError("❌ Error: 'service' no está disponible o no es válido.");
        return;
    }
    try {
        logInfo("Initializing Tuya LED Controller Plugin v2.0.1");
        logInfo("🧪 PluginUIPath = " + PluginUIPath());

        // Configurar el objeto service para QML
        service.controllers = controllers;
        service.getDevices = () => controllers;
        service.startDiscovery = () => {
            logInfo("QML requested discovery");
            if (!discoveryServiceInstance) {
                logInfo("DiscoveryService instance missing, creating...");
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
            logInfo("Service (QML interface) initialized from QML");
        };
        service.deviceTypes = (typeof DeviceList.getDeviceTypes === 'function') ? DeviceList.getDeviceTypes() : [];

        // Funciones de callback para QML
        service.deviceConfigured = (deviceId) => {
            logInfo('Device configured: ' + deviceId);
        };
        service.deviceError = (deviceId, error) => {
            logError(`Device error ${deviceId}: ${error}`);
        };
        service.negotiationComplete = (deviceId) => {
            logInfo(`Negotiation complete for device: ${deviceId}`);
        };
        service.discoveryComplete = () => {
            logInfo("Discovery process completed");
        };
        service.controllersChanged = () => {
            logInfo("Controllers changed event emitted");
        };

        loadSavedDevices();

        logInfo("Plugin initialized successfully.");
    } catch (error) {
        logError("Error initializing plugin: " + error.message);
        if (error.stack) logError(error.stack);
        throw error;
    }
}
export function PluginUIPath() {
    // UI principal ubicado en la raíz del proyecto
    return "TuyaUI.qml";
}

// CORREGIR: Render debe recibir device como parámetro
export function Render(device) {
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
        logError("Error in Render: " + error.message);
        if (error.stack) logError(error.stack);
    }
}

export function onParameterChange(parameterName, value) {
    logInfo(`Parameter changed: ${parameterName} = ${value}`);
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

export function Shutdown(SystemSuspending) {
    try {
        logInfo("Shutting down Tuya LED Controller Plugin. System Suspending: " + SystemSuspending);
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
        logInfo("Plugin shutdown complete.");
    } catch (error) {
        logError("Error during shutdown: " + error.message);
        if (error.stack) logError(error.stack);
    }
}

export function Validate(endpoint) {
    return endpoint.interface === 0;
}

// --- Servicio de Descubrimiento ---
let discoveryServiceInstance = null;

export class DiscoveryService {
    constructor() {
        logInfo("Tuya DiscoveryService constructor called.");
        this.internalDiscovery = null;
        this.negotiatorInstances = new Map();
        discoveryServiceInstance = this;
    }

    Initialize() {
        logInfo("Tuya DiscoveryService: Initialize method called.");
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
                    logError('Error writing devices_found.json: ' + e.message);
                }
            });
            this.internalDiscovery.on('error', (error) => {
                logError('DiscoveryService Internal Error: ' + error.message);
            });
            this.internalDiscovery.on('started', () => {
                logInfo('DiscoveryService Internal: Discovery started.');
            });
            this.internalDiscovery.on('stopped', () => {
                logInfo("DiscoveryService Internal: Discovery stopped.");
                if (typeof service.discoveryComplete === 'function') {
                    service.discoveryComplete();
                }
            });

            logInfo("Tuya DiscoveryService internal components initialized.");
        } catch (e) {
            logError("Error in DiscoveryService.Initialize: " + e.message);
            if (e.stack) logError(e.stack);
        }
    }

    handleTuyaDiscovery(deviceData) {
        if (!deviceData) {
            logError('DiscoveryService: handleTuyaDiscovery called with undefined data');
            return;
        }

        logInfo(`DiscoveryService: Handling discovered device: ${deviceData.id || deviceData.gwId}`);
        try {
            const deviceId = deviceData.id || deviceData.gwId;
            if (!deviceId) {
                logError("Discovered device has no ID. Skipping.");
                return;
            }

            let existingController = controllers.find(c => c.device.id === deviceId);

            if (existingController) {
                logInfo(`Device ${deviceId} already exists. Updating info.`);
                existingController.device.updateFromDiscovery(deviceData);
                if (!existingController.device.isReady() && existingController.device.localKey && existingController.device.enabled) {
                    logInfo(`Re-initiating negotiation for existing device: ${deviceId}`);
                    existingController.startNegotiation();
                }
                if (typeof service.controllersChanged === 'function') {
                    service.controllersChanged();
                }
            } else {
                logInfo(`Creating new controller for ${deviceId}`);
                const newDeviceModel = new TuyaDeviceModel(deviceData);
                if (!newDeviceModel) {
                    logError('DiscoveryService: failed to initialize TuyaDeviceModel');
                    return;
                }
                logInfo(`Estado del dispositivo: enabled=${newDeviceModel.enabled}, localKey=${newDeviceModel.localKey}`);

                const newController = new TuyaController(newDeviceModel);
                controllers.push(newController);
                service.controllers = controllers;
                if (typeof service.addController === 'function') {
                    try {
                        service.addController(newController);
                        logInfo(`✅ Controlador registrado: ${newController.device.name}`);
                        // Temporarily announce controller regardless of enabled flag
                        if (/* newDeviceModel.enabled && */ typeof service.announceController === 'function') {
                            service.announceController(newController);
                        }
                    } catch (addErr) {
                        logError('addController error: ' + addErr.message);
                    }
                }
                if (typeof service.controllersChanged === 'function') {
                    service.controllersChanged();
                }

                if (typeof service.deviceDiscovered === 'function') {
                    try {
                        service.deviceDiscovered(newDeviceModel.id, newDeviceModel.ip, newDeviceModel.localKey || '');
                    } catch (ddErr) {
                        logError('deviceDiscovered error: ' + ddErr.message);
                    }
                }

                logInfo('New device added to controllers list: ' + newDeviceModel.id);
                saveDeviceList();

                // Temporarily start negotiation regardless of LocalKey/Enabled state
                if (/* newDeviceModel.localKey && newDeviceModel.enabled */ true) {
                    logInfo(`Attempting negotiation for new device: ${newDeviceModel.id}`);
                    newController.startNegotiation();
                } else {
                    logInfo(`Device ${newDeviceModel.id} needs configuration (LocalKey/Enabled).`);
                }
            }
        } catch (error) {
            logError('Error in handleTuyaDiscovery: ' + error.message);
            if (error.stack) logError(error.stack);
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
        logInfo("DiscoveryService: Start method called by SignalRGB.");
        if (this.internalDiscovery) {
            this.internalDiscovery.startDiscovery()
                .then(() => {
                    logInfo("DiscoveryService: Sending discovery request");
                    return this.internalDiscovery.sendDiscoveryRequest();
                })
                .then(() => {
                    logInfo("DiscoveryService: Discovery request sent");
                })
                .catch((err) => {
                    logError('DiscoveryService Start error: ' + err.message);
                });
        } else {
            logError("DiscoveryService: Internal discovery not initialized. Call Initialize first.");
        }
    }

    Stop() {
        logInfo("DiscoveryService: Stop method called by SignalRGB.");
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
        
        logInfo(`Found ${deviceIds.length} saved device IDs.`);
        let loadedCount = 0;

        deviceIds.forEach(deviceId => {
            const configData = service.getSetting(deviceId, 'configData', '{}');
            const config = JSON.parse(configData);
            
            if (config.id) {
                if (!controllers.find(c => c.device.id === config.id)) {
                    const deviceModel = new TuyaDeviceModel(config || {});
                    if (!deviceModel) {
                        logError('loadSavedDevices: failed to init device model for ' + deviceId);
                        return;
                    }
                    const controller = new TuyaController(deviceModel);
                    controllers.push(controller);
                    logInfo(`Loaded device ${deviceModel.id}: enabled=${deviceModel.enabled}, localKey=${deviceModel.localKey}`);
                    loadedCount++;
                    if (!deviceModel.localKey) {
                        logInfo('Warning: no localKey stored for ' + deviceModel.id);
                    }
                    
                    if (deviceModel.enabled && deviceModel.localKey && !deviceModel.isReady()) {
                        logInfo(`Attempting negotiation for saved device: ${deviceModel.id}`);
                        try {
                            controller.startNegotiation();
                        } catch (negErr) {
                            logError('Negotiation error for ' + deviceModel.id + ': ' + negErr.message);
                        }
                    }
                }
            }
        });

        service.controllers = controllers;
        if (typeof service.controllersChanged === 'function') {
            service.controllersChanged();
        }
        logInfo(`Loaded ${loadedCount} saved devices.`);
    } catch (error) {
        logError('Error loading saved devices: ' + error.message);
        if (error.stack) logError(error.stack);
    }
}

function saveDeviceList() {
    try {
        const ids = controllers.map(c => c.device.id);
        service.saveSetting('tuyaDevices', 'deviceList', JSON.stringify(ids));
        logInfo('Device list saved.');
    } catch (error) {
        logError('Error saving device list: ' + error.message);
        if (error.stack) logError(error.stack);
    }
}

export {
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


