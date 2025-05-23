// Lista de tipos de dispositivos y configuraciones
const deviceTypes = [
    { name: 'LED Strip', defaultLeds: 30, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Bulb', defaultLeds: 1, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Panel', defaultLeds: 64, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Controller', defaultLeds: 150, dps: { power: '20', mode: '21', color: '24', brightness: '22' } }
];

// Lista de dispositivos predefinidos
const predefinedDevices = [
    {
        id: 'example_device_1',
        name: 'Tira LED Escritorio',
        key: '',
        leds: 30,
        type: 'LED Strip'
    }
];

function getDeviceTypeConfig(typeName) {
    return deviceTypes.find(type => type.name === typeName) || deviceTypes[0];
}

function getDeviceTypes() {
    return deviceTypes.map(type => type.name);
}

const DeviceList = {
    deviceTypes,
    predefinedDevices,
    getDeviceTypeConfig,
    getDeviceTypes
};

export default DeviceList;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceList;
}
