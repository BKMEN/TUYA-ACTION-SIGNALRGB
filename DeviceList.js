// Lista de tipos de dispositivos y configuraciones
'use strict';
const deviceTypes = [
    { name: 'LED Strip', defaultLeds: 30, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Bulb', defaultLeds: 1, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Panel', defaultLeds: 64, dps: { power: '1', mode: '2', color: '5', brightness: '3' } },
    { name: 'LED Controller', defaultLeds: 150, dps: { power: '20', mode: '21', color: '24', brightness: '22' } }
];

// Lista de dispositivos predefinidos
const predefinedDevices = [
    {
        id: 'bfbe7bd231444751090bsq',
        name: 'Leds habitación',
        ip: '192.168.1.131',
        key: 'dHb;IQrWT&tv?XCi',
        version: '3.5',
        productKey: 'keyj3w8cmutjmwk5',
        leds: 40,
        type: 'LED Strip',
        enabled: true
    },
    {
        id: 'bfbebb82be7220f985rawa',
        name: 'Escritorio',
        ip: '192.168.1.130',
        key: 'EvKXuTB^A0(T`quq',
        version: '3.5',
        productKey: 'keyj3w8cmutjmwk5',
        leds: 36,
        type: 'LED Strip',
        enabled: true
    },
    {
        id: 'bfde5007394a05833ahsda',
        name: 'Leds habitación 2',
        ip: '192.168.1.133',
        key: '81u+<zg)h)oNPVo/',
        version: '3.5',
        productKey: 'keyj3w8cmutjmwk5',
        leds: 40,
        type: 'LED Strip',
        enabled: true
    },
    {
        id: 'bfafad43febddb888apxbj',
        name: 'Monitor',
        ip: '192.168.1.129',
        key: 'OE4lO]Id<-ws`d;9',
        version: '3.5',
        productKey: 'keyj3w8cmutjmwk5',
        leds: 72,
        type: 'LED Strip',
        enabled: true
    }
];

// Mapeo de IDs a nombres descriptivos
const deviceAliases = {
    'bfbe7bd231444751090bsq': 'Leds habitación',
    'bfbebb82be7220f985rawa': 'Escritorio',
    'bfde5007394a05833ahsda': 'Leds habitación 2',
    'bfafad43febddb888apxbj': 'Monitor'
};

function getFriendlyName(id) {
    return deviceAliases[id] || id;
}

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
    getDeviceTypes,
    getDevices() {
        return predefinedDevices;
    },
    getFriendlyName
};

// SOLO exportar DeviceList, SIN ProductId
export default DeviceList;

