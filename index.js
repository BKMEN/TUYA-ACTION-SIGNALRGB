/**
 * Plugin principal para SignalRGB - Tuya LED Controller
 * @author BKMEN
 * @version 2.0.1 (Refactored based on fu-raz structure)
 */

// Tus importaciones de clases
import TuyaDiscoveryServiceInternal from './comms/Discovery.js'; // Renombrado para evitar conflicto con la función exportada
import TuyaController from './TuyaController.js';
import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import DeviceList from './DeviceList.js'; // Asumo que este exporta getDeviceTypes y quizás una lista predefinida

// --- Metadatos del Plugin para SignalRGB ---
export function Name() { return "Tuya LED Controller"; }
export function Version() { return "2.0.1"; } // Actualiza según tus cambios
export function Type() { return "network"; }
export function Publisher() { return "BKMEN"; }
export function Size() { return [1, 1]; } // Si cada Tuya device es 1 pixel, o si es un agregado.
                                        // Si quieres mapear múltiples LEDs de un dispositivo, esto debe cambiar,
                                        // y LedNames/LedPositions o device.setControllableLeds() deben usarse.
export function DefaultPosition() { return [240, 120]; }
export function DefaultScale() { return 100; } // O el valor que prefieras
export function DefaultComponentBrand() { return "Tuya"; }
export function VendorId() { return 0x2833; } // Tu VendorId
export function ProductId() { return 0x1337; } // Tu ProductId

export function ControllableParameters() {
    return [
        { property: "debugMode", group: "settings", label: "Debug Mode", type: "boolean", default: false },
        { property: "discoveryTimeout", group: "settings", label: "Discovery Timeout (ms)", type: "int", min: 1000, max: 30000, default: 5000 }
    ];
}

// --- Variables Globales del Plugin ---
let controllers = []; // Array de instancias de TuyaController
let globalDebugMode = false;
let globalDiscoveryTimeout = 5000;

// Objeto 'service' global para QML (similar a como lo tenías)
// Asegúrate que 'service' esté disponible globalmente si QML lo accede así,
// o que se pase explícitamente a la UI. SignalRGB usualmente provee un 'service' global.
// Si 'service.log' no está definido, usa console.log o tu propio logger.
if (typeof global === 'undefined') {
  // Polyfill para entornos no Node.js donde 'global' no existe (como algunos motores JS de Qt)
  // En el entorno de SignalRGB, 'service' y 'device' suelen ser globales.
  // Esta es una suposición; el entorno real de SignalRGB podría manejar esto de manera diferente.
  // eslint-disable-next-line no-global-assign
  global = window || this || {};
}
global.service = global.service || { log: console.log }; // Asegurar que service.log exista


// --- Funciones del Ciclo de Vida del Plugin Principal ---

export function Initialize() {
    try {
        service.log("Initializing Tuya LED Controller Plugin v2.0.1");

        // Configurar el objeto service para QML
        global.service.controllers = controllers;
        global.service.startDiscovery = () => {
            // La instancia del DiscoveryService se crea por SignalRGB
            // Aquí podríamos necesitar una forma de acceder a esa instancia si es necesario
            // o el botón de QML podría estar vinculado a una función del DiscoveryService
            // directamente si SignalRGB lo permite.
            // Por ahora, asumimos que DiscoveryService() se llama y su instancia maneja el inicio.
            service.log("QML requested discovery. DiscoveryService should handle this via its own Initialize.");
        };
        global.service.initialize = function() { // Para ser llamado desde QML Component.onCompleted
            service.log("Service (QML interface) initialized from QML");
        };
        global.service.deviceTypes = (typeof DeviceList.getDeviceTypes === 'function') ? DeviceList.getDeviceTypes() : [];

        // Funciones de callback para QML
        global.service.deviceConfigured = (deviceId) => {
            service.log('Device configured: ' + deviceId);
            // Podrías querer refrescar la UI o el estado del controller aquí
        };
        global.service.deviceError = (deviceId, error) => {
            service.log(`Device error ${deviceId}: ${error}`);
        };
        global.service.negotiationComplete = (deviceId) => {
            service.log(`Negotiation complete for device: ${deviceId}`);
        };
        global.service.discoveryComplete = () => { // Esta será llamada por nuestra instancia de DiscoveryService
            service.log("Discovery process completed (event from DiscoveryService instance)");
        };

        loadSavedDevices(); // Cargar dispositivos al inicio del plugin

        service.log("Plugin initialized successfully.");
    } catch (error) {
        service.log("Error initializing plugin: " + error.message + (error.stack ? "\n" + error.stack : ""));
        throw error;
    }
}

export function Render() {
    try {
        controllers.forEach(controllerInstance => {
            if (controllerInstance.device && controllerInstance.device.isReady()) {
                const ledColors = [];
                const ledCount = controllerInstance.device.ledCount || 1; // Usa el ledCount del dispositivo

                // Asumimos que 'device' es el objeto global de SignalRGB para este plugin
                // Si Size=[1,1], device.getLed(0) es el único relevante.
                // Si quieres mapear múltiples LEDs, Size y LedPositions/setControllableLeds deben ajustarse.
                if (typeof device !== 'undefined' && typeof device.getLed === 'function') {
                    if (ledCount === 1 || Size[0] * Size[1] === 1) { // Si el dispositivo es un solo pixel
                        const color = device.getLed(0); // Color para el único pixel del plugin
                        ledColors.push({ r: color[0], g: color[1], b: color[2] });
                    } else {
                        // Si tuvieras múltiples LEDs mapeados en el canvas de SignalRGB para este plugin
                        // (requeriría Size > [1,1] y LedPositions/setControllableLeds)
                        for (let i = 0; i < Math.min(ledCount, Size[0] * Size[1]); i++) {
                            // Aquí necesitarías una forma de mapear el i-ésimo LED del TuyaDevice
                            // a una posición (x,y) en el canvas de SignalRGB.
                            // Esto es complejo si Size es dinámico o si múltiples TuyaDevices se mapean a un canvas.
                            // Por simplicidad, si ledCount > 1 y Size > [1,1], este bucle necesitaría
                            // una lógica de mapeo adecuada. Por ahora, si Size=[1,1] pero ledCount > 1,
                            // se enviará el color del primer LED de SignalRGB a todos los LEDs del Tuya.
                            const color = device.getLed(0); // Simplificado: tomar el color del primer pixel del plugin
                            ledColors.push({ r: color[0], g: color[1], b: color[2] });
                            if (ledColors.length >= ledCount) break; // Evitar enviar más colores que LEDs tiene el dispositivo
                        }
                    }
                }


                if (ledColors.length > 0) {
                    controllerInstance.setColor(ledColors); // Llama al método de tu TuyaController
                }
            }
        });
    } catch (error) {
        service.log("Error in Render: " + error.message + (error.stack ? "\n" + error.stack : ""));
    }
}

export function onParameterChange(parameterName, value) {
    service.log(`Parameter changed: ${parameterName} = ${value}`);
    switch (parameterName) {
        case "debugMode":
            globalDebugMode = value;
            if (discoveryServiceInstance) { // Asumiendo que guardamos la instancia
                discoveryServiceInstance.debugMode = value;
            }
            controllers.forEach(c => {
                if(c.device) c.device.debugMode = value; // Asumiendo que TuyaDeviceModel tiene debugMode
                if(c.negotiator) c.negotiator.debugMode = value; // Asumiendo que TuyaSessionNegotiator tiene debugMode
            });
            break;
        case "discoveryTimeout":
            globalDiscoveryTimeout = value;
            if (discoveryServiceInstance) { // Asumiendo que guardamos la instancia
                discoveryServiceInstance.timeout = value;
            }
            break;
    }
}

export function Shutdown(SystemSuspending) { // Añadido SystemSuspending como en la plantilla
    try {
        service.log("Shutting down Tuya LED Controller Plugin. System Suspending: " + SystemSuspending);
        controllers.forEach(controller => {
            if (SystemSuspending) {
                // Opcional: enviar un comando para apagar los LEDs si el sistema se suspende/apaga
                // controller.setPower(false); o controller.setColor([{r:0,g:0,b:0}]);
            }
            if (typeof controller.cleanup === 'function') {
                controller.cleanup();
            }
        });

        if (discoveryServiceInstance) { // Asumiendo que guardamos la instancia
            discoveryServiceInstance.stopDiscovery();
            discoveryServiceInstance = null; 
        }
        controllers = []; // Limpiar la lista
        service.log("Plugin shutdown complete.");
    } catch (error) {
        service.log("Error during shutdown: " + error.message + (error.stack ? "\n" + error.stack : ""));
    }
}

export function Validate(endpoint) {
    // Para dispositivos de red, esta validación puede ser simple o no necesaria.
    // La plantilla tenía una validación más compleja para dispositivos USB HID.
    // Tu `endpoint.interface === 0` es probablemente suficiente si SignalRGB lo requiere.
    return endpoint.interface === 0; // O simplemente return true; si no aplica.
}

// --- Servicio de Descubrimiento (Estilo fu-raz) ---
let discoveryServiceInstance = null; // Para mantener la instancia del servicio de descubrimiento

export function DiscoveryService() {
    // 'this' aquí será la nueva instancia creada por SignalRGB
    service.log("Tuya DiscoveryService constructor called.");

    this.internalDiscovery = null; // Instancia de tu TuyaDiscoveryServiceInternal
    this.negotiatorInstances = new Map(); // Para manejar un negociador por dispositivo si es necesario

    // Initialize del DiscoveryService (llamado por SignalRGB después de la construcción)
    this.Initialize = function() {
        service.log("Tuya DiscoveryService: Initialize method called.");
        try {
            this.internalDiscovery = new TuyaDiscoveryServiceInternal({
                debugMode: globalDebugMode,
                timeout: globalDiscoveryTimeout
            });

            this.internalDiscovery.on('deviceDiscovered', (deviceData) => {
                this.handleTuyaDiscovery(deviceData);
            });
            this.internalDiscovery.on('error', (error) => {
                service.log('DiscoveryService Internal Error: ' + error.message);
                if (typeof global.service.deviceError === 'function') {
                    global.service.deviceError('discovery', error.message);
                }
            });
            this.internalDiscovery.on('discoveryStopped', () => {
                service.log("DiscoveryService Internal: Discovery stopped.");
                if (typeof global.service.discoveryComplete === 'function') {
                    global.service.discoveryComplete();
                }
            });

            // Iniciar descubrimiento si se configura así o si QML lo pide
            // this.internalDiscovery.startDiscovery(); // O manejar esto desde un botón en QML
            service.log("Tuya DiscoveryService internal components initialized.");
        } catch (e) {
            service.log("Error in DiscoveryService.Initialize: " + e.message + (e.stack ? "\n" + e.stack : ""));
        }
    };

    this.handleTuyaDiscovery = function(deviceData) {
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
                // Opcional: si el dispositivo estaba desconectado y ahora se descubre, intentar re-negociar.
                if (!existingController.device.isReady() && existingController.device.localKey && existingController.device.enabled) {
                    service.log(`Re-initiating negotiation for existing device: ${deviceId}`);
                    existingController.startNegotiation();
                }
            } else {
                service.log(`Creating new controller for ${deviceId}`);
                const newDeviceModel = new TuyaDeviceModel(deviceData); // Usa los datos del descubrimiento
                // loadSettings() ya se llama en el constructor de TuyaDeviceModel
                
                const newController = new TuyaController(newDeviceModel);
                controllers.push(newController);
                global.service.controllers = controllers; // Actualizar referencia para QML

                service.log('New device added to controllers list: ' + newDeviceModel.id);
                saveDeviceList(); // Guardar la lista actualizada de IDs de dispositivos

                if (newDeviceModel.localKey && newDeviceModel.enabled) {
                    service.log(`Attempting negotiation for new device: ${newDeviceModel.id}`);
                    newController.startNegotiation();
                } else {
                    service.log(`Device ${newDeviceModel.id} needs configuration (LocalKey/Enabled).`);
                }
            }
        } catch (error) {
            service.log('Error in handleTuyaDiscovery: ' + error.message + (error.stack ? "\n" + error.stack : ""));
        }
    };

    // El método Update es llamado periódicamente por SignalRGB para el DiscoveryService
    this.Update = function(force) {
        // El `TuyaNegotiator.test.js` de fu-raz tenía un `negotiator.handleQueue(now)`.
        // Si tu `TuyaSessionNegotiator` necesita un ciclo de actualización (ej. para reintentos),
        // podrías iterar sobre tus instancias de negociador aquí.
        // Por ahora, lo dejamos vacío a menos que tu lógica de negociación lo requiera.
        controllers.forEach(controller => {
            if (controller.negotiator && typeof controller.negotiator.handleQueue === 'function') {
                // controller.negotiator.handleQueue(Date.now()); // Si tus negociadores tienen este método
            }
        });
    };

    // Este método es llamado por SignalRGB cuando el DiscoveryService debe iniciar la búsqueda.
    // En fu-raz, el botón de QML podría llamar a una función que active esto.
    // O SignalRGB podría llamarlo automáticamente.
    this.Start = function() {
        service.log("DiscoveryService: Start method called by SignalRGB.");
        if (this.internalDiscovery) {
            this.internalDiscovery.startDiscovery();
        } else {
            service.log("DiscoveryService: Internal discovery not initialized. Call Initialize first.");
        }
    };

    this.Stop = function() {
        service.log("DiscoveryService: Stop method called by SignalRGB.");
        if (this.internalDiscovery) {
            this.internalDiscovery.stopDiscovery();
        }
    };
    
    // Guardar la instancia para que otras funciones puedan acceder a sus métodos si es necesario
    discoveryServiceInstance = this;
}


// --- Funciones Auxiliares (movidas desde el cuerpo de Initialize o globales) ---

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
                // Evitar duplicados si ya existe por alguna razón (aunque controllers debería estar vacío aquí)
                if (!controllers.find(c => c.device.id === config.id)) {
                    const deviceModel = new TuyaDeviceModel(config); // loadSettings es llamado en constructor
                    const controller = new TuyaController(deviceModel);
                    controllers.push(controller);
                    loadedCount++;
                    
                    if (deviceModel.enabled && deviceModel.localKey && !deviceModel.isReady()) {
                        service.log(`Attempting negotiation for saved device: ${deviceModel.id}`);
                        controller.startNegotiation();
                    }
                }
            }
        });
        global.service.controllers = controllers; // Asegurar que QML tenga la lista actualizada
        service.log('Loaded ' + loadedCount + ' devices from settings. Total controllers: ' + controllers.length);
    } catch (error) {
        service.log('Error loading saved devices: ' + error.message + (error.stack ? "\n" + error.stack : ""));
    }
}

function saveDeviceList() {
    try {
        const deviceIds = controllers.map(c => c.device.id);
        service.saveSetting('tuyaDevices', 'deviceList', JSON.stringify(deviceIds));
        service.log(`Saved ${deviceIds.length} device IDs to list.`);
    } catch (error) {
        service.log('Error saving device list: ' + error.message + (error.stack ? "\n" + error.stack : ""));
    }
}

// Para que SignalRGB reconozca las funciones exportadas,
// si el entorno no soporta ES6 modules directamente para plugins,
// se necesitaría module.exports. Asumiendo que sí los soporta por ahora.
// Si sigue sin cargar, considera cambiar a module.exports.
/*
module.exports = {
    Name, Version, Type, Publisher, Size, DefaultPosition, DefaultScale,
    DefaultComponentBrand, VendorId, ProductId, ControllableParameters,
    Initialize, Render, onParameterChange, Shutdown, DiscoveryService, Validate
};
*/
