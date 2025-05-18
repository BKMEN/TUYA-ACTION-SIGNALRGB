import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQml 2.15

Item {
    width: 400
    height: 300

    property var devices: []

    Button {
        text: "Buscar dispositivos Tuya"
        onClicked: {
            // Llama a discoverDevices en backend
            if (service) {
                service.discoverDevices();
            } else {
                console.error("Service object is not defined.");
            }
        }
    }

    ListView {
        id: deviceList
        width: parent.width
        height: 200
        model: devices
        reuseItems: true
        cacheBuffer: 100

        delegate: Rectangle {
            height: 40
            border.width: 1

            Text {
                text: "ID: " + (modelData.id !== undefined ? modelData.id : "N/A") + 
                      " | IP: " + (modelData.ip !== undefined ? modelData.ip : "N/A")
            }
        }
    }

    // Esto lo debes conectar a backend, por ejemplo con SignalRGB service API
    QtObject {
        id: service

        // Mock implementation for SignalRGB service API
        function discoverDevices() {
            console.log("Discovering devices...");
            // Replace this with actual API call to discover devices
        }

        function getDevices() {
            console.log("Fetching devices...");
            // Replace this with actual API call to fetch devices
            return [
                { id: "Device1", ip: "192.168.1.2" },
                { id: "Device2", ip: "192.168.1.3" }
            ];
        }
    }

    Connections {
        onDevicesChanged: {
            if (service && typeof service.getDevices === "function") {
                devices = service.getDevices();
            } else {
                console.error("Service object is not defined or getDevices method is missing.");
            }
        }
        }
    }
}
