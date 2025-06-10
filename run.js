import TuyaDiscovery from './comms/Discovery.js';
import TuyaController from './TuyaController.js';
import NegotiatorManager from './negotiators/NegotiatorManager.js';
import DeviceList from './DeviceList.js';
import service from './service.js';

globalThis.service = globalThis.service || service;

Object.assign(service, {
    log: console.log,
    debug: console.debug,
    deviceError: (id, msg) => console.warn(`\u274c Error [${id}]: ${msg}`),
    deviceConfigured: (id) => console.log(`\u2705 Configurado [${id}]`),
    negotiationComplete: (id) => console.log(`\ud83d\udd10 Negociaci\u00f3n completada [${id}]`)
});

if (typeof service.getSetting !== 'function') {
    service.getSetting = (section, key, defaultValue = '') => {
        console.log(`\u2699\ufe0f getSetting mock: ${section}, ${key} -> ${defaultValue}`);
        if (section === 'tuyaDevices' && key === 'deviceList') {
            const ids = DeviceList.getDevices().map(d => d.id);
            return JSON.stringify(ids);
        }
        if (key === 'configData') {
            const device = DeviceList.getDevices().find(d => d.id === section);
            if (device) {
                return JSON.stringify({
                    id: device.id,
                    ip: device.ip,
                    localKey: device.key,
                    version: device.version,
                    productKey: device.productKey,
                    leds: device.leds,
                    type: device.type,
                    enabled: device.enabled
                });
            }
        }
        return defaultValue;
    };
}

// Configuraci\u00f3n
const EXPECTED_DEVICES = 4; // Dispositivos esperados
const TIMEOUT_MS = 5000;    // Tiempo m\u00e1ximo de espera

// Crear instancia de descubrimiento
const discovery = new TuyaDiscovery();
let found = 0;
const discovered = [];

// Crear controlador
const controller = new TuyaController();
const manager = new NegotiatorManager();

// Escuchar cuando se encuentra un dispositivo

discovery.on('device_found', (device) => {
    found += 1;
    discovered.push(device);
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
discovery.on('stopped', () => {
    console.log('\ud83d\ude91 Descubrimiento detenido');
    const devicesToNegotiate = [];
    for (const d of discovered) {
        const config = DeviceList.getDevices().find(x => x.id === d.id);
        if (!config || !config.key) {
            console.warn(`\u26a0\ufe0f Dispositivo ${d.id} sin clave, se omite`);
            continue;
        }
        const full = { ...d, ...config, leds: config.leds || 30, type: config.type || 'LED Strip' };
        controller.addDevice(full);
        devicesToNegotiate.push({
            deviceId: full.id,
            deviceKey: full.key,
            ip: full.ip,
            controller
        });
    }
    if (devicesToNegotiate.length) {
        manager.startBatchNegotiation(devicesToNegotiate, 10000);
    }
});

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
