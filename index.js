import TuyaController from './TuyaController.js';
import DeviceList from './DeviceList.js';

// Arranca el controlador principal
const controller = new TuyaController(DeviceList);
controller.discoverDevices(); // Descubre dispositivos Tuya

// Aquí iría la lógica para comunicar con la UI, etc.
