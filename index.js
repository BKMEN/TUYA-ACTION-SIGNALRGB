// index.js

const TuyaController = require('./TuyaController.js');

// Instancia el controlador principal
const controller = new TuyaController();

// Inicia el proceso de descubrimiento de dispositivos Tuya
console.log('Buscando dispositivos Tuya en la red local...');
controller.discoverDevices();
