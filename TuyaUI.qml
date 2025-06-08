import QtQuick 2.15
import QtQuick.Controls 2.15

ApplicationWindow {
    id: root
    width: 400
    height: 300
    visible: true
    title: qsTr("Test UI")

    Text {
        anchors.centerIn: parent
        text: qsTr("SignalRGB Test")
    }
}
