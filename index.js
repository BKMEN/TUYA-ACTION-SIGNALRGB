// =====================
// TUYA-ACTION-SIGNALRGB
// =====================
// index.js: Entry point for SignalRGB Tuya plugin
// Versión basada en fu-raz/signalrgb-tuya-razer, con refactor para claridad y modularidad

import TuyaController from "./TuyaController.js";
import { logInfo, logWarn, logError } from "./utils/logger.js";

// === Datos del plugin ===
export function Name() { return "TUYA ACTION RGB"; }
export function Version() { return "1.0.0"; }
export function Type() { return "network"; }
export function Publisher() { return "BKMEN"; }
export function Size() { return [1, 60]; }
export function DefaultPosition() { return [75, 70]; }
export function DefaultScale() { return 1.0; }

// === Parámetros configurables para la UI ===
export function ControllableParameters() {
  return [
    { property: "g_sMode", label: "Lighting Mode", type: "combobox", values: ["Canvas", "Unicorns", "Rainbow", "Static"], default: "Canvas" },
    { property: "g_iBrightness", label: "Brightness", type: "number", min: 1, max: 100, default: 50 },
    { property: "g_iLedCount", label: "LED Count", type: "number", min: 1, max: 100, default: 24 },
    { property: "g_sColor", label: "Color", type: "color", default: "#FFFFFF" },
    { property: "g_sDevice", label: "Device", type: "combobox", values: [], default: "" } // Dispositivos encontrados dinámicamente
  ];
}

// === Variables globales del plugin ===
let tuyaController = null;

// === Inicialización principal ===
export function Initialize(parameters, savedState) {
  logInfo("Inicializando TUYA ACTION RGB...");

  // Inicia el controlador principal, con eventos para UI
  tuyaController = new TuyaController({
    onDevicesChanged: updateDevicesInUI,
    onError: showErrorInUI,
    onLog: logInfo,
  });

  // Arranca el descubrimiento de dispositivos Tuya en red local
  tuyaController.startDiscovery();
}

// === Sincronización con UI ===
export function OnParameterChanged(parameter) {
  if (!tuyaController) return;

  switch (parameter) {
    case "g_iLedCount":
      tuyaController.setLedCount(global.g_iLedCount);
      break;
    case "g_sColor":
      tuyaController.setColor(global.g_sColor);
      break;
    case "g_sDevice":
      tuyaController.setCurrentDevice(global.g_sDevice);
      break;
    case "g_sMode":
      tuyaController.setMode(global.g_sMode);
      break;
    case "g_iBrightness":
      tuyaController.setBrightness(global.g_iBrightness);
      break;
    default:
      logWarn(`Parámetro desconocido cambiado: ${parameter}`);
  }
}

// === Actualiza la lista de dispositivos en el comboBox de la UI ===
function updateDevicesInUI(devices) {
  let deviceNames = devices.map(dev => dev.name);
  SetParameterValues("g_sDevice", deviceNames, devices[0]?.name || "");
}

// === Manejo de errores en la UI ===
function showErrorInUI(message) {
  logError(message);
  // Aquí puedes añadir un evento para mostrar error en la interfaz si tu UI lo permite
}

// === Finalización/limpieza ===
export function Terminate() {
  if (tuyaController) {
    tuyaController.terminate();
    tuyaController = null;
  }
}

