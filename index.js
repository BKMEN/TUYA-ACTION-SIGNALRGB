// =============================================
// index.js - SignalRGB-Tuya
// Plugin principal para controlar dispositivos Tuya desde SignalRGB
// Basado en la estructura Cololight, adaptado para Tuya, preparado para escalabilidad y fácil depuración.
// =============================================

// --- Métadatos del plugin ---
export function Name() { return "Tuya RGB"; }
export function Version() { return "1.0.0"; }
export function Type() { return "network"; }
export function Publisher() { return "SignalRGB"; }
export function Size() { return [1, 60]; } // Cambia si necesitas un grid diferente
export function DefaultPosition() { return [0, 70]; }
export function DefaultScale() { return 1.0; }
export function ImageUrl() { return ""; } // Agrega la URL de la imagen si está disponible

// --- Parámetros controlables desde la UI ---
export function ControllableParameters() {
  return [
    {
      "property": "g_sMode",
      "label": "Lighting Mode",
      "type": "combobox",
      "values": [
        "Canvas", "Canvas Multi", "Forced", "Rainbow", "Music", "Custom"
      ],
      "default": "Canvas"
    },
    {
      "property": "g_iBrightness",
      "label": "Brightness",
      "type": "number",
      "min": "1",
      "max": "100",
      "step": "1",
      "default": "50"
    },
    {
      "property": "g_ledCount",
      "label": "LED Count",
      "type": "number",
      "min": "1",
      "max": "120",
      "step": "1",
      "default": "4"
    },
    {
      "property": "forcedColor",
      "label": "Forced Color",
      "type": "color",
      "default": "#009bde"
    },
    {
      "property": "shutdownColor",
      "label": "Shutdown Color",
      "type": "color",
      "default": "#000000"
    }
  ];
}

// --- Variables internas ---
let streamingAddress = "";
let streamingPort = 6668; // Puerto estándar Tuya LAN
let g_currentBrightness = 0;
let g_sCurrentMode = "";
let g_ledCount = 4;
let g_sCurrentForced = "";
let deviceConnected = false;
let tuyaKey = "";
let tuyaId = "";

// --- Inicialización del dispositivo ---
export function Initialize() {
  device.setName(controller.name || "Tuya Device");
  streamingAddress = controller.ip || "192.168.1.129";
  tuyaKey = controller.key || "OE4lO]Id<-ws`d;9"; // IMPORTANTE: Clave local de tu dispositivo
  tuyaId = controller.id || "bfafad43febddb888apxbj";   // ID local de tu dispositivo

  device.setImageFromUrl(controller.image || "");

  // Sincronizamos valores iniciales
  SetBrightness(g_iBrightness);
  g_sCurrentMode = g_sMode || "Canvas";
  g_ledCount = g_ledCount || 4;
}

// --- Sincronizaciones de parámetros ---
function SyncBrightness() {
  if (g_currentBrightness !== g_iBrightness) {
    SetBrightness(g_iBrightness);
  }
}

function SyncMode() {
  if (g_sCurrentMode !== g_sMode) {
    g_sCurrentMode = g_sMode;
    SetMode(g_sCurrentMode);
  }
}

function SyncLedCount() {
  if (g_ledCount !== g_ledCount) {
    SetLedCount(g_ledCount);
  }
}

// --- Comandos de control Tuya ---
// NOTA: Aquí irían las llamadas a las funciones de la API/UDP/TCP de Tuya para enviar comandos reales.
// Ejemplo:
function SetBrightness(brightness) {
  // Valida rango
  brightness = Math.max(1, Math.min(brightness, 100));
  g_currentBrightness = brightness;
  // Aquí va el envío real a tu dispositivo Tuya (UDP o TCP, según la implementación)
  device.log("SetBrightness: " + brightness);
  // tuyaComms.sendBrightness(streamingAddress, streamingPort, tuyaId, tuyaKey, brightness);
}

function SetMode(mode) {
  device.log("SetMode: " + mode);
  // Según el modo, arma el paquete adecuado
  // tuyaComms.sendMode(streamingAddress, streamingPort, tuyaId, tuyaKey, mode);
}

function SetLedCount(count) {
  device.log("SetLedCount: " + count);
  // tuyaComms.sendLedCount(streamingAddress, streamingPort, tuyaId, tuyaKey, count);
}

function SetColor(r, g, b) {
  device.log("SetColor: " + r + ", " + g + ", " + b);
  // tuyaComms.sendColor(streamingAddress, streamingPort, tuyaId, tuyaKey, r, g, b);
}

// --- Render principal: se llama cada frame/tick ---
export function Render() {
  SyncBrightness();
  SyncMode();
  SyncLedCount();

  // Según el modo, envía comandos en tiempo real
  if (g_sCurrentMode === "Canvas") {
    // Modo canvas (ejemplo: todo un color)
    let color = forcedColor || { r: 0, g: 155, b: 222 };
    SetColor(color.r, color.g, color.b);
  }
  else if (g_sCurrentMode === "Canvas Multi") {
    // Aquí va la lógica de varios colores/segmentos
  }
  else if (g_sCurrentMode === "Forced") {
    // Color forzado
    let color = forcedColor || { r: 0, g: 155, b: 222 };
    SetColor(color.r, color.g, color.b);
  }
  // Añade más modos según necesidad
}

// --- Apagado del dispositivo ---
export function Shutdown() {
  device.log("Shutdown: Blackout command sent.");
  // tuyaComms.sendBlackout(streamingAddress, streamingPort, tuyaId, tuyaKey);
}

// --- Validación del dispositivo ---
export function Validate(endpoint) {
  return endpoint.interface === 0 && endpoint.usage === 0 && endpoint.usage_page === 0;
}

// --- Conversión de color hexadecimal a RGB ---
function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  let colors = [];
  colors[0] = parseInt(result[1], 16);
  colors[1] = parseInt(result[2], 16);
  colors[2] = parseInt(result[3], 16);
  return colors;
}
