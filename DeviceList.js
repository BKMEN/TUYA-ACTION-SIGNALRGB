// Añadir función ProductId
function ProductId() { return 0x0004; }

// Lista de dispositivos predefinidos
const deviceList = [
    // Lista tus dispositivos aquí
    {
        id: 'xxx',
        name: 'Tira LED escritorio',
        key: 'yyy',
        leds: 15,
    },
    // ...
];

deviceList.ProductId = ProductId;

module.exports = deviceList;
