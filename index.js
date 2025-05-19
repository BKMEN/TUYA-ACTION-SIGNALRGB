// --------------------------------------------------- //
// Tuya Action for SignalRGB
// Author: BKMEN
// Version: 1.0.0
// --------------------------------------------------- //

// Define package.json inline for easy access
const packageJson = {
  "name": "tuya-action-signalrgb",
  "version": "1.0.0",
  "description": "Plugin para controlar dispositivos Tuya desde SignalRGB",
  "main": "index.js",
  "author": "BKMEN",
  "license": "MIT",
  "dependencies": {
    "dgram": "^1.0.1",
    "events": "^3.3.0",
    "net": "^1.0.2",
    "os": "^0.1.2"
  }
};

// Define funciones requeridas por SignalRGB
function Name() { return "Tuya Action"; }
function Version() { return packageJson.version; }
function Type() { return "network"; }
function Publisher() { return packageJson.author; }
function Size() { return [1, 1]; }
function DefaultPosition() { return [240, 80]; }
function DefaultScale() { return 8.0; }
function DefaultTint() { return "0x000000"; }
// ESTO ES MUY IMPORTANTE: Solo index.js debe exportar estos métodos
function VendorId() { return 0x2712; } // ID único para el fabricante
function ProductId() { return 0x1337; } // ID único para el producto (valor entero)

function ControllableParameters() {
    return [
        { "name": "IP", "type": "text", "default": "", "size": "medium", "tooltip": "IP address of your Tuya device" },
        { "name": "Key", "type": "text", "default": "", "size": "medium", "tooltip": "Local key of your Tuya device" },
        { "name": "Device ID", "type": "text", "default": "", "size": "medium", "tooltip": "Device ID (gwId) of your Tuya device" },
        { "name": "LED Count", "type": "number", "default": 72, "min": 1, "max": 500, "step": 1, "tooltip": "Number of LEDs in your Tuya device" },
        { "name": "Brightness", "type": "number", "default": 100, "min": 0, "max": 100, "step": 1, "tooltip": "Brightness of your Tuya device" },
        { "name": "Connection Status", "type": "text", "default": "Disconnected", "size": "medium", "tooltip": "Current connection status", "readOnly": true },
        { "name": "Auto Connect", "type": "boolean", "default": true, "tooltip": "Automatically connect to device on startup" },
        { "name": "Debug Mode", "type": "boolean", "default": false, "tooltip": "Enable debug logging" },
    ];
}

// Constants for Tuya protocol
const PROTOCOL_33_HEADER = 0x55aa;
const PROTOCOL_33_VERSION = 0x0003;
const PROTOCOL_33_COMMAND_QUERY_DEVICE_STATE = 0x0a;
const PROTOCOL_33_COMMAND_SEND_DEVICE_COMMAND = 0x07;
const PROTOCOL_33_COMMAND_HANDSHAKE = 0x01;

// Usa require en lugar de import para compatibilidad con Node.js
const net = require('net');
const os = require('os');
const dgram = require('dgram');
let device = null;

// Variables para el plugin
let ipAddress = "";
let localKey = "";
let deviceId = "";
let ledCount = 72;
let brightness = 100;
let autoConnect = true;
let debugMode = false;
let connectionStatus = "Disconnected";
let sequence = 0;
let socket = null;
let connected = false;
let lastSentColors = [];
let deviceInfoInterval = null;
let reconnectInterval = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;

/** 
 * Initialize the plugin
 */
function Initialize() {
    if (debugMode) {
        console.log("Tuya Action: Initializing...");
    }
}

/**
 * Called when the plugin is launched
 */
function onStart(dev) {
    device = dev;
    ipAddress = device.getParameter("IP");
    localKey = device.getParameter("Key");
    deviceId = device.getParameter("Device ID");
    ledCount = device.getParameter("LED Count");
    brightness = device.getParameter("Brightness");
    autoConnect = device.getParameter("Auto Connect");
    debugMode = device.getParameter("Debug Mode");
    
    if (debugMode) {
        console.log("Tuya Action: Starting...");
        console.log(`Tuya Action: IP=${ipAddress}, DeviceID=${deviceId}, LEDs=${ledCount}`);
    }
    
    // Auto-connect if all parameters are set
    if (autoConnect && ipAddress && localKey && deviceId) {
        connect();
    }
}

/**
 * Called when the plugin is stopped
 */
function onStop() {
    if (debugMode) {
        console.log("Tuya Action: Stopping...");
    }
    
    // Clean up
    disconnect();
}

/**
 * Called when a new frame is available
 */
function onFrame() {
    if (connected) {
        updateDeviceColor();
    }
}

/**
 * Called when a device changes state
 */
function onStateChange(state) {
    if (debugMode) {
        console.log(`Tuya Action: State changed to ${state}`);
    }
}

/**
 * Called when a device should be rendered
 */
function Render() {
    // This function is called to render the device on the Signal RGB canvas
    // Since we're controlling external hardware, we don't need to render anything custom here
}

/**
 * Handle parameter changes
 */
function onParameterChange(parameter, value) {
    if (parameter === "IP") {
        ipAddress = value;
        if (socket && connected) {
            disconnect();
        }
        if (ipAddress && localKey && deviceId && autoConnect) {
            connect();
        }
    } else if (parameter === "Key") {
        localKey = value;
    } else if (parameter === "Device ID") {
        deviceId = value;
    } else if (parameter === "LED Count") {
        ledCount = value;
    } else if (parameter === "Brightness") {
        brightness = value;
        if (connected) {
            updateDeviceColor();
        }
    } else if (parameter === "Auto Connect") {
        autoConnect = value;
        if (autoConnect && ipAddress && localKey && deviceId && !connected) {
            connect();
        }
    } else if (parameter === "Debug Mode") {
        debugMode = value;
    }
}

// Funciones internas
/**
 * Connect to the Tuya device
 */
function connect() {
    if (connected) {
        if (debugMode) {
            console.log("Tuya Action: Already connected");
        }
        return;
    }

    if (!ipAddress || !localKey || !deviceId) {
        updateConnectionStatus("Missing configuration");
        return;
    }

    try {
        if (debugMode) {
            console.log(`Tuya Action: Connecting to ${ipAddress}...`);
        }
        
        updateConnectionStatus("Connecting...");
        
        // PROBLEMA: La función createSocket() no está definida
        socket = createSocket(ipAddress, 6668);
        
        socket.onConnect = () => {
            if (debugMode) {
                console.log("Tuya Action: Socket connected");
            }
            performHandshake();
        };
        
        socket.onDisconnect = () => {
            if (debugMode) {
                console.log("Tuya Action: Socket disconnected");
            }
            
            connected = false;
            updateConnectionStatus("Disconnected");
            
            // Attempt reconnect if auto-connect is enabled
            if (autoConnect) {
                scheduleReconnect();
            }
        };
        
        socket.onError = (error) => {
            console.error(`Tuya Action: Socket error: ${error}`);
            updateConnectionStatus(`Error: ${error}`);
            connected = false;
            
            if (autoConnect) {
                scheduleReconnect();
            }
        };
        
        socket.onData = (data) => {
            processResponse(data);
        };

        socket.connect();
    } catch (error) {
        console.error(`Tuya Action: Connection error: ${error}`);
        updateConnectionStatus(`Error: ${error}`);
        
        if (autoConnect) {
            scheduleReconnect();
        }
    }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
    if (reconnectInterval) {
        clearInterval(reconnectInterval);
    }
    
    reconnectAttempts++;
    
    if (reconnectAttempts > maxReconnectAttempts) {
        if (debugMode) {
            console.log(`Tuya Action: Max reconnect attempts (${maxReconnectAttempts}) reached. Giving up.`);
        }
        updateConnectionStatus("Reconnect failed. Please check settings.");
        return;
    }
    
    const delay = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000); // Exponential backoff
    
    if (debugMode) {
        console.log(`Tuya Action: Scheduling reconnect attempt ${reconnectAttempts} in ${delay/1000}s`);
    }
    
    updateConnectionStatus(`Reconnecting in ${delay/1000}s...`);
    
    reconnectInterval = setInterval(() => {
        if (!connected && autoConnect) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
            connect();
        } else {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    }, delay);
}

/**
 * Disconnect from the Tuya device
 */
function disconnect() {
    if (socket) {
        try {
            socket.disconnect();
        } catch (error) {
            console.error(`Tuya Action: Error disconnecting: ${error}`);
        }
        socket = null;
    }
    
    if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
    }
    
    if (deviceInfoInterval) {
        clearInterval(deviceInfoInterval);
        deviceInfoInterval = null;
    }
    
    connected = false;
    updateConnectionStatus("Disconnected");
}

/**
 * Update the connection status parameter
 */
function updateConnectionStatus(status) {
    connectionStatus = status;
    device.setParameter("Connection Status", status);
}

/**
 * Perform handshake with the Tuya device
 */
function performHandshake() {
    if (debugMode) {
        console.log("Tuya Action: Performing handshake");
    }
    
    try {
        const payload = {
            gwId: deviceId,
            devId: deviceId
        };
        
        sendCommand(PROTOCOL_33_COMMAND_HANDSHAKE, JSON.stringify(payload));
        
        // After handshake, start querying device state
        setTimeout(() => {
            queryDeviceState();
            
            // Set up regular device info polling
            if (deviceInfoInterval) {
                clearInterval(deviceInfoInterval);
            }
            
            deviceInfoInterval = setInterval(() => {
                if (connected) {
                    queryDeviceState();
                }
            }, 30000); // Query every 30 seconds
            
        }, 1000);
    } catch (error) {
        console.error(`Tuya Action: Handshake error: ${error}`);
        updateConnectionStatus(`Handshake Error: ${error}`);
    }
}

/**
 * Query the device state
 */
function queryDeviceState() {
    if (debugMode) {
        console.log("Tuya Action: Querying device state");
    }
    
    try {
        const payload = {
            gwId: deviceId,
            devId: deviceId
        };
        
        sendCommand(PROTOCOL_33_COMMAND_QUERY_DEVICE_STATE, JSON.stringify(payload));
    } catch (error) {
        console.error(`Tuya Action: Query state error: ${error}`);
    }
}

/**
 * Send a command to the device
 */
function sendCommand(command, payload) {
    if (!socket) {
        if (debugMode) {
            console.log("Tuya Action: Cannot send command - socket not connected");
        }
        return;
    }
    
    try {
        sequence++;
        
        // Create command packet according to Tuya protocol 3.3
        const payloadBuffer = stringToUint8Array(payload);
        const header = createCommandHeader(command, payloadBuffer.length);
        const packet = new Uint8Array(header.length + payloadBuffer.length);
        
        packet.set(header);
        packet.set(payloadBuffer, header.length);
        
        if (debugMode) {
            console.log(`Tuya Action: Sending command ${command} with payload: ${payload}`);
        }
        
        socket.write(packet);
    } catch (error) {
        console.error(`Tuya Action: Error sending command: ${error}`);
    }
}

/**
 * Create command header according to Tuya protocol
 */
function createCommandHeader(command, payloadLength) {
    const prefixLength = 16; // Fixed header size
    const bufferSize = prefixLength;
    
    const buffer = new Uint8Array(bufferSize);
    const view = new DataView(buffer.buffer);
    
    // Set protocol prefix and version
    view.setUint32(0, PROTOCOL_33_HEADER, false);
    view.setUint32(4, PROTOCOL_33_VERSION, false);
    
    // Set command
    view.setUint32(8, command, false);
    
    // Set sequence number
    view.setUint32(12, sequence, false);
    
    // Calculate CRC and set it
    // Note: CRC implementation is simplified here
    
    return buffer;
}

/**
 * Process a response from the device
 */
function processResponse(data) {
    try {
        if (data.length < 16) {
            if (debugMode) {
                console.log("Tuya Action: Response too short");
            }
            return;
        }
        
        const view = new DataView(data.buffer);
        const prefix = view.getUint32(0, false);
        const version = view.getUint32(4, false);
        const command = view.getUint32(8, false);
        const seqNum = view.getUint32(12, false);
        
        if (prefix !== PROTOCOL_33_HEADER) {
            if (debugMode) {
                console.log("Tuya Action: Invalid response prefix");
            }
            return;
        }
        
        if (debugMode) {
            console.log(`Tuya Action: Received command ${command}, seq ${seqNum}`);
        }
        
        if (command === PROTOCOL_33_COMMAND_HANDSHAKE) {
            if (debugMode) {
                console.log("Tuya Action: Handshake successful");
            }
            connected = true;
            reconnectAttempts = 0;
            updateConnectionStatus("Connected");
        } else if (command === PROTOCOL_33_COMMAND_QUERY_DEVICE_STATE) {
            if (data.length <= 16) {
                if (debugMode) {
                    console.log("Tuya Action: No payload in state response");
                }
                return;
            }
            
            // Parse device state from payload
            const payloadData = data.slice(16);
            const payloadStr = uint8ArrayToString(payloadData);
            
            if (debugMode) {
                console.log(`Tuya Action: Device state: ${payloadStr}`);
            }
            
            try {
                const state = JSON.parse(payloadStr);
                if (state && state.dps) {
                    // Process device state
                    if (debugMode) {
                        console.log(`Tuya Action: Device data points: ${JSON.stringify(state.dps)}`);
                    }
                }
            } catch (e) {
                console.error(`Tuya Action: Error parsing device state: ${e}`);
            }
        }
    } catch (error) {
        console.error(`Tuya Action: Error processing response: ${error}`);
    }
}

/**
 * Convert string to Uint8Array
 */
function stringToUint8Array(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

/**
 * Convert Uint8Array to string
 */
function uint8ArrayToString(array) {
    const decoder = new TextDecoder();
    return decoder.decode(array);
}

/**
 * Update the device color based on the current LED colors
 */
function updateDeviceColor() {
    if (!connected) {
        return;
    }
    
    const colors = [];
    
    for (let i = 0; i < ledCount; i++) {
        const led = device.getLed(i);
        colors.push([led[0], led[1], led[2]]);
    }
    
    // Compare with last sent colors to prevent unnecessary updates
    if (colorsEqual(colors, lastSentColors)) {
        return;
    }
    
    lastSentColors = [...colors];
    
    // Format the command payload for Tuya device
    const payload = {
        devId: deviceId,
        gwId: deviceId,
        uid: "",
        t: Date.now().toString(),
        dps: {
            "1": true,  // Power on
            "2": "colour", // Mode - color
            "3": brightness, // Brightness
            "5": createColorString(colors) // Color data
        }
    };
    
    if (debugMode) {
        console.log(`Tuya Action: Updating color: ${JSON.stringify(payload)}`);
    }
    
    sendCommand(PROTOCOL_33_COMMAND_SEND_DEVICE_COMMAND, JSON.stringify(payload));
}

/**
 * Create color string for the Tuya device based on LED colors
 */
function createColorString(colors) {
    // Calculate average color from all LEDs
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    
    for (const color of colors) {
        totalR += color[0];
        totalG += color[1];
        totalB += color[2];
    }
    
    const avgR = Math.round(totalR / colors.length);
    const avgG = Math.round(totalG / colors.length);
    const avgB = Math.round(totalB / colors.length);
    
    // Format the color string according to Tuya protocol
    // Example: Tuya expects color format like "001400640064" for RGB (20, 100, 100)
    // Format is RRGGBBHHHH (H is for Hue and Saturation)
    
    const hexR = avgR.toString(16).padStart(2, '0');
    const hexG = avgG.toString(16).padStart(2, '0');
    const hexB = avgB.toString(16).padStart(2, '0');
    
    // Calculate HSV values for Tuya format
    const [h, s, v] = rgbToHsv(avgR, avgG, avgB);
    const hexH = Math.round(h * 360).toString(16).padStart(4, '0');
    const hexS = Math.round(s * 1000).toString(16).padStart(4, '0');
    
    return `${hexR}${hexG}${hexB}${hexH}${hexS}`;
}

/**
 * Convert RGB to HSV
 */
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, v = max;
    
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    
    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    return [h, s, v];
}

/**
 * Compare two arrays of colors
 */
function colorsEqual(colors1, colors2) {
    if (colors1.length !== colors2.length) {
        return false;
    }
    
    for (let i = 0; i < colors1.length; i++) {
        if (colors1[i][0] !== colors2[i][0] ||
            colors1[i][1] !== colors2[i][1] ||
            colors1[i][2] !== colors2[i][2]) {
            return false;
        }
    }
    
    return true;
}

// Socket function
function createSocket(ip, port) {
    const socket = new net.Socket();
    
    const socketWrapper = {
        connect: () => {
            socket.connect(port, ip);
        },
        disconnect: () => {
            socket.end();
            socket.destroy();
        },
        write: (data) => {
            socket.write(data);
        },
        onConnect: null,
        onDisconnect: null,
        onData: null,
        onError: null
    };
    
    socket.on('connect', () => {
        if (socketWrapper.onConnect) socketWrapper.onConnect();
    });
    
    socket.on('close', () => {
        if (socketWrapper.onDisconnect) socketWrapper.onDisconnect();
    });
    
    socket.on('data', (data) => {
        if (socketWrapper.onData) socketWrapper.onData(data);
    });
    
    socket.on('error', (error) => {
        if (socketWrapper.onError) socketWrapper.onError(error.message);
    });
    
    return socketWrapper;
}

// Polyfill para TextEncoder/TextDecoder en Node.js
if (typeof TextEncoder === 'undefined') {
    const util = require('util');
    global.TextEncoder = util.TextEncoder;
    global.TextDecoder = util.TextDecoder;
}

// Exportación en formato compatible con SignalRGB
module.exports = {
    Name,
    Version,
    Type,
    Publisher,
    Size,
    DefaultPosition,
    DefaultScale,
    DefaultTint,
    VendorId,        // Solo index.js debe tener estos
    ProductId,       // Solo index.js debe tener estos
    ControllableParameters,
    Initialize,
    onParameterChange,
    onStart,
    onStop,
    onFrame,
    onStateChange,
    Render
};