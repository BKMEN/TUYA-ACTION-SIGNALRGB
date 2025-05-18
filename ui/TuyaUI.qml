import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    width: 400
    height: 300

    property var devices: []

    Button {
        text: "Buscar dispositivos Tuya"
        onClicked: {
            // Llama a discoverDevices en backend
            service.discoverDevices();
        }
    }

    ListView {
        id: deviceList
        width: parent.width
        height: 200
        model: devices

        delegate: Rectangle {
            width: parent.width
            height: 40
            border.width: 1

            Text {
                text: "ID: " + modelData.id + " | IP: " + modelData.ip
            }
        }
    }

    // Esto lo debes conectar a backend, por ejemplo con SignalRGB service API
    Connections {
        target: service
        onDevicesChanged: {
            devices = service.getDevices();
        }
    }
}
