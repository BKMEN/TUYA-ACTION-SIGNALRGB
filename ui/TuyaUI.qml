import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Dialogs 1.3
import QtQml 2.15
import QtQuick.Controls.Material 2.15
import QtGraphicalEffects 1.15


Item {
    id: root
    width: 600
    height: 500
    //title: "Controlador LED Tuya"
    visible: true


    property var devices: []
    property int selectedDeviceIndex: -1
    property color selectedColor: "#ffffff"
    property int globalLedCount: 30
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

    // Indicador sencillo para saber que el UI se cargó
    Text {
        id: uiLoadedLabel
        text: "UI cargada"
        anchors.top: parent.top
        anchors.horizontalCenter: parent.horizontalCenter
        color: "#ff0000"
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

                            onClicked: {
                                if (service && service.startDiscovery) {
                                    isDiscovering = true;
                                    service.startDiscovery();
                                    showSuccess("Búsqueda iniciada...");
                                }
                            }
                        }

                        BusyIndicator {
                            anchors.verticalCenter: parent.verticalCenter
                            visible: isDiscovering
                            running: isDiscovering
                            width: 20
                            height: 20
                        }

                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Dispositivos: " + (service && service.controllers ? service.controllers.length : 0)
                            color: "#555"
                        }
                    }
                }
            }

            // Lista de dispositivos configurables
            GroupBox {
                title: "📱 Configuración de Dispositivos"
                width: parent.width

                ListView {
                    id: deviceList
                    width: parent.width
                    height: Math.min(400, contentHeight)
                    model: service ? service.controllers : []
                    spacing: 8

                    delegate: Rectangle {
                        id: deviceItem
                        width: parent.width
                        height: deviceColumn.height + 20
                        color: "#f8f9fa"
                        border.color: "#e9ecef"
                        border.width: 1
                        radius: 8

                        // Acceso al controlador del dispositivo (similar a FU-RAZ)
                        property var controller: modelData

                        Column {
                            id: deviceColumn
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.margins: 10
                            spacing: 8

                            // Información del dispositivo
                            Row {
                                width: parent.width
                                spacing: 10

                                Rectangle {
                                    width: 10
                                    height: 10
                                    radius: 5
                                    color: (controller && controller.device && controller.device.initialized) ? "#4caf50" : "#f44336"
                                    anchors.verticalCenter: parent.verticalCenter
                                }

                                Column {
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: 2

                                    Text {
                                        text: "📟 " + (controller && controller.device ? controller.device.id : "ID Desconocido")
                                        font.bold: true
                                        color: "#333"
                                        font.pixelSize: 14
                                    }

                                    Text {
                                        text: "🌐 " + (controller && controller.device ? controller.device.ip : "IP Desconocida") + 
                                              " • " + (controller && controller.device && controller.device.initialized ? "Conectado" : "Desconectado")
                                        color: "#666"
                                        font.pixelSize: 11
                                    }
                                }
                            }

                            // Controles de configuración
                            Grid {
                                width: parent.width
                                columns: 2
                                columnSpacing: 15
                                rowSpacing: 8

                                // Habilitar dispositivo
                                Row {
                                    spacing: 8
                                    Text {
                                        text: "Habilitado:"
                                        anchors.verticalCenter: parent.verticalCenter
                                        font.pixelSize: 12
                                    }
                                    Switch {
                                        id: enabledSwitch
                                        checked: controller && controller.device ? controller.device.enabled : false
                                    }
                                }

                                // Tipo de dispositivo
                                Row {
                                    spacing: 8
                                    Text {
                                        text: "Tipo:"
                                        anchors.verticalCenter: parent.verticalCenter
                                        font.pixelSize: 12
                                    }
                                    ComboBox {
                                        id: deviceTypeCombo
                                        width: 120
                                        model: ["LED Strip", "LED Bulb", "LED Panel"]
                                        currentIndex: {
                                            if (controller && controller.device) {
                                                let type = controller.device.deviceType || "LED Strip";
                                                return model.indexOf(type);
                                            }
                                            return 0;
                                        }
                                    }
                                }
                            }

                            // Local Key (campo de contraseña)
                            Row {
                                width: parent.width
                                spacing: 8
                                
                                Text {
                                    text: "Local Key:"
                                    anchors.verticalCenter: parent.verticalCenter
                                    font.pixelSize: 12
                                    width: 80
                                }
                                
                                TextField {
                                    id: localKeyField
                                    width: parent.width - 180
                                    placeholderText: "Ingrese la clave local del dispositivo..."
                                    echoMode: TextInput.Password
                                    text: controller && controller.device ? (controller.device.localKey || "") : ""
                                    font.pixelSize: 11
                                }
                                
                                Button {
                                    text: "👁"
                                    width: 30
                                    height: 30
                                    onClicked: {
                                        localKeyField.echoMode = localKeyField.echoMode === TextInput.Password ? 
                                                                 TextInput.Normal : TextInput.Password;
                                    }
                                }
                            }

                            // Botón guardar configuración
                            Button {
                                text: "💾 Guardar Configuración"
                                enabled: localKeyField.text.length > 0
                                width: parent.width
                                
                                onClicked: {
                                    if (controller && typeof controller.updateDeviceConfig === "function") {
                                        try {
                                            controller.updateDeviceConfig(
                                                localKeyField.text,
                                                enabledSwitch.checked,
                                                deviceTypeCombo.currentText
                                            );
                                            showSuccess("Dispositivo " + controller.device.id + " configurado");
                                        } catch (e) {
                                            showError("Error configurando dispositivo: " + e.toString());
                                        }
                                    } else {
                                        showError("updateDeviceConfig no disponible en el controlador");
                                    }
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
                        visible: deviceList.count === 0
                    }
                }
            }

            // Control global de color (simplificado)
            GroupBox {
                title: "🎨 Control Global"
                width: parent.width

                Column {
                    width: parent.width
                    spacing: 10

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

                    // Botón aplicar a todos
                    Button {
                        text: "🚀 Aplicar a Dispositivos Habilitados"
                        width: parent.width
                        enabled: service && service.controllers && service.controllers.length > 0
                        
                        onClicked: {
                            if (service && service.controllers) {
                                let applied = 0;
                                service.controllers.forEach(controller => {
                                    if (controller.device && controller.device.enabled && controller.device.initialized) {
                                        try {
                                            if (typeof controller.setColor === "function") {
                                                let rgb = {
                                                    r: Math.round(selectedColor.r * 255),
                                                    g: Math.round(selectedColor.g * 255),
                                                    b: Math.round(selectedColor.b * 255)
                                                };
                                                controller.setColor([rgb]);
                                                applied++;
                                            }
                                        } catch (e) {
                                            showError("Error en dispositivo " + controller.device.id + ": " + e.toString());
                                        }
                                    }
                                });
                                
                                if (applied > 0) {
                                    showSuccess("Color aplicado a " + applied + " dispositivos");
                                } else {
                                    showError("No hay dispositivos habilitados e inicializados");
                                }
                            }
                        }
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
        Material.theme = Material.Dark

        // Inicializar el puente con el backend si está disponible
        if (service && typeof service.initialize === "function") {
            service.initialize();
        }
        // Cargar dispositivos al iniciar
        if (service && typeof service.getDevices === "function") {
            devices = service.getDevices();
        }
    }

    // Conexiones para eventos del servicio (comunicación JS -> QML)
    Connections {
        target: service
        function onDeviceConfigured(deviceId) {
            showSuccess("Dispositivo configurado: " + deviceId);
        }
        function onDeviceError(deviceId, error) {
            showError("Error en " + deviceId + ": " + error);
        }
        function onNegotiationComplete(deviceId) {
            showSuccess("Conexión establecida con: " + deviceId);
        }
        function onDiscoveryComplete() {
            isDiscovering = false;
            showSuccess("Búsqueda completada");
        }
        function onControllersChanged() {
            devices = service.getDevices();
        }
    }
}
