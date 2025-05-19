import Discovery from './comms/Discovery.js';
import TuyaController from './TuyaController.js';
import TuyaVirtualDevice from './TuyaVirtualDevice.js';

// --- Plugin metadata ---
export function Name() { return "Tuya RGB"; }
export function Version() { return "1.0.0"; }
export function Type() { return "network"; }
export function Publisher() { return "SignalRGB"; }
export function Size() { return [1, 60]; }
export function DefaultPosition() { return [0, 70]; }
export function DefaultScale() { return 1.0; }
export function ImageUrl() { return "assets/logo.png"; } // O como lo exportes

// --- Parámetros controlables ---
export function ControllableParameters() {
  return [
    { "property":"lightingMode", "group":"settings", "label":"Lighting Mode", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas" },
    { "property":"forcedColor", "group":"settings", "label":"Forced Color", "type":"color", "default":"#009bde" },
    { "property":"shutdownColor", "group":"settings", "label":"Shutdown Color", "type":"color", "default":"#000000" }
  ];
}

// --- Instancia del virtual device ---
let tuyaVirtualDevice = null;

// --- Inicialización: conecta VirtualDevice ---
export function Initialize() {
  if (controller && controller.enabled) {
    tuyaVirtualDevice = new TuyaVirtualDevice(controller.tuyaDevice);
  }
}

export function Render() {
  if (controller && controller.enabled && tuyaVirtualDevice) {
    tuyaVirtualDevice.render(lightingMode, forcedColor, Date.now());
  }
}

export function Shutdown() {
  if (tuyaVirtualDevice) tuyaVirtualDevice.shutdown(shutdownColor);
}

export function Validate() { return true; }

// --- Discovery Service exportado para SignalRGB ---
export function DiscoveryService() {
  // Basado en tu Discovery.js y el ejemplo de Tuya Razer
  this.discovery = null;

  this.Initialize = function() {
    this.discovery = new Discovery();
    this.discovery.on('deviceFound', this.handleTuyaDiscovery.bind(this));
    this.discovery.start();
  };

  this.handleTuyaDiscovery = function(deviceData) {
    if (!service.hasController(deviceData.gwId)) {
      service.log('Creando controlador para ' + deviceData.gwId);
      try {
        const controller = new TuyaController(deviceData);
        service.addController(controller);
        if (controller.enabled) service.announceController(controller);
      } catch (ex) {
        service.log(ex.message);
      }
    }
  };

  this.Update = function() {
    if (this.discovery) this.discovery.update();
  };
}
