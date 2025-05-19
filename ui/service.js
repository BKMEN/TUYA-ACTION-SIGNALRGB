/**
 * Servicio para comunicación entre UI y lógica del plugin
 */

function ProductId() { return 0x0005; }

// Referencia al controlador principal
let controller = null;

/**
 * Inicializa el servicio con una referencia al controlador
 * @param {Object} tuyaController - Instancia del controlador de Tuya
 */
function initialize(tuyaController) {
    controller = tuyaController;
}

/**
 * Descubre dispositivos en la red
 * @returns {Promise<Array>} Lista de dispositivos encontrados
 */
function discoverDevices() {
    if (!controller) return Promise.resolve([]);
    return controller.startDiscovery();
}

/**
 * Obtiene todos los dispositivos conocidos
 * @returns {Array} Lista de dispositivos
 */
function getAllDevices() {
    if (!controller) return [];
    return controller.getAllDevices();
}

/**
 * Establece el color para un dispositivo
 * @param {string} id - ID del dispositivo
 * @param {Array} colors - Array de colores RGB
 * @returns {Promise<boolean>} Resultado de la operación
 */
function setDeviceColors(id, colors) {
    if (!controller) return Promise.resolve(false);
    return controller.setDeviceColors(id, colors);
}

/**
 * Establece la cantidad de LEDs para un dispositivo
 * @param {string} id - ID del dispositivo
 * @param {number} count - Cantidad de LEDs
 * @returns {Promise<boolean>} Resultado de la operación
 */
function setDeviceLedCount(id, count) {
    if (!controller) return Promise.resolve(false);
    return controller.setDeviceLedCount(id, count);
}

// Establecer ProductId
const service = {
    ProductId,
    initialize,
    discoverDevices,
    getAllDevices,
    setDeviceColors,
    setDeviceLedCount
};

module.exports = service;