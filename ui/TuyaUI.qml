import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQml 2.15

Item {
    width: 400
    height: 300

    property var devices: []

    // Botón para buscar dispositivos Tuya
    Button {
        text: "Buscar dispositivos Tuya"
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.margins: 10
        onClicked: {
            if (service) {
                service.discoverDevices();
            } else {
                console.error("Service object is not defined.");
            }
        }
    }

    // ListView que muestra los dispositivos descubiertos
    ListView {
        id: deviceList
        anchors.top: parent.top
        anchors.topMargin: 50
        anchors.left: parent.left
        width: parent.width
        height: 200
        model: devices
        reuseItems: true
        cacheBuffer: 100

        delegate: Rectangle {
            width: parent.width
            height: 40
            border.width: 1
            color: "transparent"

            Text {
                anchors.centerIn: parent
                text: "ID: " + (modelData.id !== undefined ? modelData.id : "N/A") + 
                      " | IP: " + (modelData.ip !== undefined ? modelData.ip : "N/A")
            }
        }
    }

    // Timer para refrescar la lista cada segundo (puedes ajustar el intervalo)
    Timer {
        id: refreshTimer
        interval: 1000
        running: true
        repeat: true
        onTriggered: {
            if (service && typeof service.getDevices === "function") {
                let found = service.getDevices();
                if (found && found.length !== devices.length) {
                    devices = found;
                }
            }
        }
    }

    // ---- Esto es un MOCK para pruebas, reemplázalo por tu "service" real ----
    QtObject {
        id: service

        // Cuando tengas tu backend real, quita esto y expón discoverDevices/getDevices desde Node.js
        function discoverDevices() {
            console.log("Discovering devices...");
            // Aquí llamas al backend real de Node.js (no necesitas nada más aquí si SignalRGB lo hace solo)
        }

        function getDevices() {
            // Esta función debe devolver el array real del backend.
            // Aquí está el mock. Quita esto cuando tengas la integración real.
            return [
                { id: "Device1", ip: "192.168.1.2" },
                { id: "Device2", ip: "192.168.1.3" }
            ];
        }
    }
    // -----------------------------------------------------------------------

}
