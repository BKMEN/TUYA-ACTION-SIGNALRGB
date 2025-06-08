import TuyaDiscovery from './comms/Discovery.js';
import TuyaController from './TuyaController.js';
import DeviceList from './DeviceList.js';

globalThis.service = globalThis.service || {
    log: console.log,
    deviceError: (id, msg) => console.warn(`\u274c Error [${id}]: ${msg}`),
    deviceConfigured: (id) => console.log(`\u2705 Configurado [${id}]`),
    negotiationComplete: (id) => console.log(`\ud83d\udd10 Negociaci\u00f3n completada [${id}]`)
};

if (typeof service.getSetting !== 'function') {
    service.getSetting = (key, defaultValue) => {
        console.log(`\u2699\ufe0f getSetting mock: ${key} -> ${defaultValue}`);
        return defaultValue;
    };
}

// Configuraci\u00f3n
const EXPECTED_DEVICES = 4; // Dispositivos esperados
const TIMEOUT_MS = 5000;    // Tiempo m\u00e1ximo de espera

// Crear instancia de descubrimiento
const discovery = new TuyaDiscovery();
let found = 0;

// Crear controlador
const controller = new TuyaController();

// Escuchar cuando se encuentra un dispositivo

discovery.on('device_found', async (device) => {
    found += 1;

    // Buscar configuraci\u00f3n local del dispositivo (con key) en DeviceList
    const config = DeviceList.getDevices().find(d => d.id === device.id);
    if (config && config.key) {
        // Si hay key, fusionar con los datos descubiertos
        const fullDevice = {
            ...device,
            ...config,
            leds: config.leds || 30,
            type: config.type || 'LED Strip',
        };

        // Agregar al controlador y conectar
        try {
            controller.addDevice(fullDevice);
            await controller.connectToDevice(fullDevice.id);
            console.log(`\ud83c\udf89 Dispositivo ${fullDevice.name} listo para usarse`);
        } catch (err) {
            console.error(`\u274c Error al conectar con ${fullDevice.name}:`, err.message);
        }
    } else {
        console.warn(`\u26a0\ufe0f Dispositivo ${device.id} descubierto sin clave definida. Saltando...`);
    }

    stopIfNeeded();
});

// Funci\u00f3n para detener el descubrimiento si se cumplen condiciones
function stopIfNeeded() {
    if (found >= EXPECTED_DEVICES && discovery.isRunning) {
        console.log(`\u2705 Se encontraron ${found} dispositivos. Deteniendo descubrimiento...`);
        discovery.stop();
    }
}

// Logs de control
discovery.on('started', () => console.log('\ud83d\ude80 Descubrimiento iniciado'));
discovery.on('stopped', () => console.log('\ud83d\ude91 Descubrimiento detenido'));

// Iniciar descubrimiento
await discovery.start();
await discovery.sendDiscoveryRequest();

// Timeout de seguridad
setTimeout(() => {
    if (discovery.isRunning) {
        console.log('\u23f1\ufe0f Tiempo de espera agotado. Deteniendo descubrimiento.');
        discovery.stop();
    }
}, TIMEOUT_MS);
