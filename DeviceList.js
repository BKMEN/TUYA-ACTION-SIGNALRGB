// Lista de tipos de dispositivos y configuraciones predeterminadas
const deviceTypes = [
    { name: 'LED Strip', defaultLeds: 30, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Bulb', defaultLeds: 1, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Panel', defaultLeds: 64, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Controller', defaultLeds: 150, dps: { power: '1', mode: '2', color: '5', brightness: '3' } }
];

// Lista de dispositivos predefinidos (para usuarios que prefieren configuración manual)
const predefinedDevices = [
    // Ejemplos - usuarios pueden agregar sus dispositivos aquí
    {
        id: 'example_device_1',
        name: 'Tira LED Escritorio',
        key: '', // Usuario debe llenar
        leds: 30,
        type: 'LED Strip'
    }
    // ...más dispositivos
];

// Función para obtener configuración por tipo
function getDeviceTypeConfig(typeName) {
    return deviceTypes.find(type => type.name === typeName) || deviceTypes[0];
}

// Función para obtener lista de tipos
function getDeviceTypes() {
    return deviceTypes.map(type => type.name);
}

// Exportar para uso en otros módulos
const DeviceList = {
    deviceTypes,
    predefinedDevices,
    getDeviceTypeConfig,
    getDeviceTypes
};

export default DeviceList;

// Para compatibilidad con require()
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceList;
}
