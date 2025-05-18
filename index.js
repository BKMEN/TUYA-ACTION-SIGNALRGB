// index.js

const TuyaController = require('./TuyaController.js');

// Instancia el controlador principal
const controller = new TuyaController();

// Inicia el proceso de descubrimiento de dispositivos Tuya
console.log('Buscando dispositivos Tuya en la red local...');
controller.discoverDevices();
// Removed redundant and incorrect ImageUrl function definitions

// Function to return the image URL
export function ImageUrl() {
  return "https://github.com/BKMEN/signalrgb-tuya-battletron/blob/main/logo.png?raw=true";
}
export function Name() { 
  return "Tuya Razer"; 
}
export function getPublisher() { 
  return "RickOfficial"; 
}
export function Version() { 
  return "0.0.1"; 
}
export function getName() { 
  return "Tuya Razer"; 
}
export function Publisher() { 
  return "RickOfficial"; 
}
export function Size() { 
  return [1, 1]; 
}
export function getDefaultPosition() { 
  return [0, 70]; 
}
export function DefaultScale() { 
  return 1.0; 
}
export function getType() { 
  return "Plugin"; 
}