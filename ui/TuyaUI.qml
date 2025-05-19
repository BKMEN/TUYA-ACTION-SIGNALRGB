import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Dialogs 1.3
import QtQml 2.15

ApplicationWindow {
    id: window
    width: 600
    height: 500
    title: "Controlador LED Tuya"
    visible: true

    property var devices: []
    property int selectedDeviceIndex: -1
    property color selectedColor: "#ffffff"
    property int ledCount: 30
    property bool isDiscovering: false
    property string statusMessage: ""

    // Función para mostrar errores
    function showError(message) {
        statusMessage = "❌ " + message;
        statusTimer.restart();
        console.log("Error:", message);
    }

    // Función para mostrar éxito
    function showSuccess(message) {
        statusMessage = "✅ " + message;
        statusTimer.restart();
        console.log("Success:", message);
    }

    // Timer para limpiar mensajes de estado
    Timer {
        id: statusTimer
        interval: 5000
        onTriggered: statusMessage = ""
    }

    ScrollView {
        anchors.fill: parent
        anchors.margins: 20

        Column {
            width: parent.width
            spacing: 20

            // Encabezado
            Rectangle {
                width: parent.width
                height: 60
                color: "#667eea"
                radius: 10

                Text {
                    anchors.centerIn: parent
                    text: "🏠 Controlador LED Tuya"
                    color: "white"
                    font.pixelSize: 24
                    font.bold: true
                }
            }

            // Mensaje de estado
            Rectangle {
                width: parent.width
                height: statusMessage ? 40 : 0
                color: statusMessage.startsWith("❌") ? "#ffebee" : "#e8f5e9"
                radius: 5
                visible: statusMessage

                Text {
                    anchors.centerIn: parent
                    text: statusMessage
                    color: statusMessage.startsWith("❌") ? "#c62828" : "#2e7d32"
                    font.pixelSize: 14
                }
            }

            // Sección de búsqueda
            GroupBox {
                title: "🔍 Búsqueda de Dispositivos"
                width: parent.width

                Column {
                    width: parent.width
                    spacing: 10

                    Row {
                        spacing: 10
                        anchors.horizontalCenter: parent.horizontalCenter

                        Button {
                            text: isDiscovering ? "Buscando..." : "Buscar Dispositivos"
                            enabled: !isDiscovering
                            Material.background: Material.Blue
                            Material.foreground: "white"
                            
                            onClicked: {
                                if (service) {
                                    isDiscovering = true;
                                    service.discoverDevices();
                                    showSuccess("Búsqueda iniciada...");
                                    
                                    // Simular finalización después de 3 segundos
                                    Qt.createQmlObject("import QtQuick 2.15; Timer { interval: 3000; running: true; onTriggered: { window.isDiscovering = false; destroy(); } }", window);
                                }
                            }

                            BusyIndicator {
                                anchors.centerIn: parent
                                visible: isDiscovering
                                width: 20
                                height: 20
                            }
                        }

                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Dispositivos encontrados: " + devices.length
                            color: "#555"
                        }
                    }
                }
            }

            // Lista de dispositivos
            GroupBox {
                title: "📱 Dispositivos Encontrados"
                width: parent.width

                ListView {
                    id: deviceList
                    width: parent.width
                    height: Math.min(200, contentHeight)
                    model: devices
                    currentIndex: selectedDeviceIndex

                    delegate: Rectangle {
                        width: parent.width
                        height: 50
                        color: ListView.isCurrentItem ? "#e3f2fd" : "transparent"
                        border.color: ListView.isCurrentItem ? "#1976d2" : "#ddd"
                        border.width: 1
                        radius: 5

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                deviceList.currentIndex = index;
                                selectedDeviceIndex = index;
                                showSuccess("Dispositivo seleccionado: " + modelData.id);
                            }
                        }

                        Row {
                            anchors.left: parent.left
                            anchors.leftMargin: 15
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 15

                            Rectangle {
                                width: 12
                                height: 12
                                radius: 6
                                color: modelData.online ? "#4caf50" : "#f44336"
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            Column {
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 2

                                Text {
                                    text: "📟 " + (modelData.id || "ID Desconocido")
                                    font.bold: true
                                    color: "#333"
                                }

                                Text {
                                    text: "🌐 " + (modelData.ip || "IP Desconocida") + " • " + (modelData.online ? "En línea" : "Desconectado")
                                    color: "#666"
                                    font.pixelSize: 12
                                }
                            }
                        }
                    }

                    // Placeholder cuando no hay dispositivos
                    Text {
                        anchors.centerIn: parent
                        text: isDiscovering ? "Buscando dispositivos..." : "No hay dispositivos encontrados.\nPresiona 'Buscar Dispositivos' para comenzar."
                        color: "#999"
                        horizontalAlignment: Text.AlignHCenter
                        visible: devices.length === 0
                    }
                }
            }

            // Control de color
            GroupBox {
                title: "🎨 Selección de Color"
                width: parent.width

                Row {
                    spacing: 15
                    anchors.horizontalCenter: parent.horizontalCenter

                    Button {
                        text: "Elegir Color"
                        Material.background: Material.Indigo
                        Material.foreground: "white"
                        onClicked: colorDialog.open()
                    }

                    Rectangle {
                        width: 60
                        height: 40
                        color: selectedColor
                        border.color: "#888"
                        border.width: 1
                        radius: 5

                        Text {
                            anchors.centerIn: parent
                            text: "👁"
                            color: Qt.colorEqual(selectedColor, "#ffffff") ? "#333" : "white"
                            font.pixelSize: 18
                        }
                    }

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: "RGB: " + Math.round(selectedColor.r * 255) + ", " + 
                              Math.round(selectedColor.g * 255) + ", " + 
                              Math.round(selectedColor.b * 255)
                        color: "#555"
                        font.family: "monospace"
                    }
                }
            }

            // Control de LEDs
            GroupBox {
                title: "💡 Cantidad de LEDs"
                width: parent.width

                Column {
                    width: parent.width
                    spacing: 10

                    Row {
                        width: parent.width
                        spacing: 15

                        Text {
                            text: "LEDs:"
                            anchors.verticalCenter: parent.verticalCenter
                            font.bold: true
                        }

                        Slider {
                            id: ledSlider
                            from: 1
                            to: 300
                            value: ledCount
                            width: parent.width - 150
                            onValueChanged: ledCount = Math.round(value)

                            background: Rectangle {
                                x: ledSlider.leftPadding
                                y: ledSlider.topPadding + ledSlider.availableHeight / 2 - height / 2
                                width: ledSlider.availableWidth
                                height: 4
                                radius: 2
                                color: "#e0e0e0"

                                Rectangle {
                                    width: ledSlider.visualPosition * parent.width
                                    height: parent.height
                                    color: "#667eea"
                                    radius: 2
                                }
                            }

                            handle: Rectangle {
                                x: ledSlider.leftPadding + ledSlider.visualPosition * (ledSlider.availableWidth - width)
                                y: ledSlider.topPadding + ledSlider.availableHeight / 2 - height / 2
                                width: 20
                                height: 20
                                radius: 10
                                color: ledSlider.pressed ? "#5a67d8" : "#667eea"
                                border.color: "#4a5568"
                                border.width: 1
                            }
                        }

                        Text {
                            text: ledCount
                            anchors.verticalCenter: parent.verticalCenter
                            font.bold: true
                            font.pixelSize: 16
                            color: "#333"
                            width: 40
                        }
                    }

                    Text {
                        text: "Rango: 1 - 300 LEDs"
                        color: "#666"
                        font.pixelSize: 12
                    }
                }
            }

            // Botón de envío
            Button {
                text: getButtonText()
                enabled: selectedDeviceIndex >= 0 && devices[selectedDeviceIndex] && devices[selectedDeviceIndex].online
                width: parent.width
                height: 50
                Material.background: enabled ? Material.Green : Material.Grey
                Material.foreground: "white"
                font.pixelSize: 16

                onClicked: {
                    if (selectedDeviceIndex < 0) {
                        showError("No hay dispositivo seleccionado");
                        return;
                    }

                    try {
                        let dev = devices[selectedDeviceIndex];
                        if (!dev) {
                            showError("Dispositivo no válido");
                            return;
                        }

                        if (!dev.online) {
                            showError("El dispositivo está desconectado");
                            return;
                        }

                        // Conversión de color QML a RGB
                        let rgb = {
                            r: Math.round(selectedColor.r * 255),
                            g: Math.round(selectedColor.g * 255),
                            b: Math.round(selectedColor.b * 255)
                        };

                        // Llamadas al servicio
                        if (service) {
                            service.setDeviceColor(dev.id, [rgb]);
                            service.setDeviceLedCount(dev.id, ledCount);
                            showSuccess("Configuración enviada a " + dev.id);
                        } else {
                            showError("Servicio no disponible");
                        }
                    } catch (e) {
                        showError("Error inesperado: " + e.toString());
                    }
                }
            }
        }
    }

    // Dialogo de color
    // Este componente permite al usuario seleccionar un color mediante una interfaz gráfica.
    // Cuando el usuario confirma su selección, el color elegido se asigna a la propiedad `selectedColor`.
    // Además, se muestra un mensaje de éxito para confirmar la acción.
    ColorDialog {
        id: colorDialog
        title: "Seleccionar Color"
        onAccepted: {
            selectedColor = colorDialog.color;
            showSuccess("Color seleccionado");
        }
    }

    // Timer para actualización automática de dispositivos
    Timer {
        id: refreshTimer
        interval: 5000  // Interval increased to 5 seconds to reduce polling frequency
        running: true
        repeat: true
        onTriggered: {
            if (service && typeof service.getDevices === "function" && !isDiscovering) {
                let found = service.getDevices();
                if (found && found.length !== devices.length) {
                    devices = found;
                    showSuccess("Lista de dispositivos actualizada");
                }
            }
        }
    }

    // Mock del servicio (reemplazar por integración real)
    // Para integrar un backend real:
    // 1. Reemplace este QtObject con un módulo que se comunique con su backend (por ejemplo, usando XMLHttpRequest o WebSocket).
    // 2. Asegúrese de que las funciones discoverDevices, getDevices, setDeviceColor y setDeviceLedCount estén implementadas para interactuar con su backend.
    // 3. Configure las URL o endpoints necesarios para las llamadas al backend.
    // 4. Pruebe la integración para garantizar que los datos se envían y reciben correctamente.
    

    // Inicialización
    // Function to compute button text
    function getButtonText() {
        if (selectedDeviceIndex >= 0) {
            return "🚀 Enviar a " + (devices[selectedDeviceIndex] ? devices[selectedDeviceIndex].id : "dispositivo");
        }
        return "⚠️ Selecciona un dispositivo";
    }

    Component.onCompleted: {
        // Cargar dispositivos al iniciar
        if (service) {
            devices = service.getDevices();
        }
    }
}