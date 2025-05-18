// index.js

const TuyaController = require('./TuyaController.js');

// Instancia el controlador principal
const controller = new TuyaController();

// Inicia el proceso de descubrimiento de dispositivos Tuya
console.log('Buscando dispositivos Tuya en la red local...');
controller.discoverDevices();
// Removed redundant and incorrect ImageUrl function definitions

// Function to return the image URL
export class DiscoveryService {
  constructor() {
    this.IconUrl = "https://github.com/BKMEN/TUYA-ACTION-SIGNALRGB/blob/main/assets/logo.png?raw=true";
  }
}

export function Name() { 
  return "Tuya Razer"; 
}
export function getPublisher() { 
  return "RickOfficial"; 
}
export function Version() { 
  return "0.0.1"; 
// Removed redundant getName function as it duplicates the Name function
}
export function Publisher() { 
  return "RickOfficial"; 
// Removed redundant Publisher function as it duplicates getPublisher
export function getSize() { 
  return [1, 1]; 
}
}
export function getDefaultScale() { 
  return 1.0; 
}
export function getType() { 
  // Returns the type of this module, which is "Plugin" indicating it is a plugin for the system.
  return "Plugin"; 
}