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
    },
    {
        id: 'bfbe7bd231444751090bsq', // Product gwId de la imagen
        name: 'Leds habitación (Barra Battletroon 1)', // Puedes ponerle un nombre descriptivo
        ip: '192.168.1.131', // De la imagen
        key: 'dHb;IQRwT&tv?XCi', // De la imagen de lista de keys
        version: '3.5', // De la imagen
        productKey: 'keyj3w8cmutjmwk5', // De la imagen
        leds: 40, // De tu imagen JSON inicial
        type: 'LED Strip'
    },
    {
        id: 'bfbebb82be7220f985rawa', // Product gwId de la imagen
        name: 'Escritorio (Barra Battletroon 2)',
        ip: '192.168.1.130', // De la imagen
        key: 'EvKXuTB^A0(T`quq', // De la imagen de lista de keys
        version: '3.5', // De la imagen
        productKey: 'keyj3w8cmutjmwk5', // De la imagen
        leds: 36, // De tu imagen JSON inicial
        type: 'LED Strip'
    },
    {
        id: 'bfde5007394a05833ahsda', // Product gwId de la imagen
        name: 'Leds habitación 2 (Barra Battletroon 3)',
        ip: '192.168.1.133', // De la imagen
        key: '81u+<zg)h)oNPVo/', // De la imagen de lista de keys
        version: '3.5', // De la imagen
        productKey: 'keyj3w8cmutjmwk5', // De la imagen
        leds: 40, // De tu imagen JSON inicial
        type: 'LED Strip'
    },
    {
        id: 'bfafad43febddb888apxbj', // Product gwId de la imagen
        name: 'Monitor (Barra Battletroon 4)',
        ip: '192.168.1.129', // De la imagen
        key: 'OE4L0]Id<-ws`d;9', // De la imagen de lista de keys
        version: '3.5', // De la imagen
        productKey: 'keyj3w8cmutjmwk5', // De la imagen
        leds: 72, // De tu imagen JSON inicial
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
