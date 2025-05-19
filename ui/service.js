export function GetGUI() {
  return `
<?xml version="1.0" encoding="utf-8"?>
<Ui xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="urn:ui">
  <Window name="TuyaActionMainWindow" title="Tuya Action Controller" width="600" height="500" resizeH="true" resizeV="true" layout="vbox" backgroundOpacity="0.97">
    <Item layoutAlignment="center" marginTop="16">
      <Image src="images/logo.png" width="156" height="48" />
    </Item>

    <Rectangle fillOpacity="0.1" height="1" marginTop="16" marginBottom="16" />

    <!-- Status Panel -->
    <Rectangle fillColor="#292A2D" cornerRadius="8" marginBottom="16">
      <Item layout="hbox" marginTop="12" marginBottom="12" marginLeft="16" marginRight="16">
        <Item layout="vbox" width="0.6">
          <Text textSize="18" fontStyle="bold">Device Status</Text>
          <Item layout="hbox" marginTop="8">
            <Text width="120">Connection:</Text>
            <Text id="ConnectionStatus" width="0.7">Disconnected</Text>
          </Item>
          <Item layout="hbox" marginTop="4">
            <Text width="120">Device ID:</Text>
            <Text id="DeviceId" width="0.7">Not configured</Text>
          </Item>
          <Item layout="hbox" marginTop="4">
            <Text width="120">IP Address:</Text>
            <Text id="IpAddress" width="0.7">Not configured</Text>
          </Item>
          <Item layout="hbox" marginTop="4">
            <Text width="120">LED Count:</Text>
            <Text id="LedCount" width="0.7">0</Text>
          </Item>
        </Item>
        <Item layout="vbox" width="0.4" layoutAlignment="center">
          <Item layout="hbox" layoutAlignment="center">
            <Button id="ConnectButton" textSize="14" width="110" height="36" marginRight="8">Connect</Button>
            <Button id="DisconnectButton" textSize="14" width="110" height="36">Disconnect</Button>
          </Item>
          <Rectangle height="8" />
          <Button id="RefreshButton" textSize="14" width="224" height="36">Refresh Device</Button>
        </Item>
      </Item>
    </Rectangle>

    <!-- Configuration Panel -->
    <Rectangle fillColor="#292A2D" cornerRadius="8">
      <Item layout="vbox" marginTop="12" marginBottom="12" marginLeft="16" marginRight="16">
        <Text textSize="18" fontStyle="bold">Device Configuration</Text>
        
        <Item layout="hbox" marginTop="12">
          <Text width="120" layoutAlignment="center">IP Address:</Text>
          <TextEdit id="IpInput" width="0.7" placeholder="Enter device IP address" />
        </Item>
        
        <Item layout="hbox" marginTop="8">
          <Text width="120" layoutAlignment="center">Local Key:</Text>
          <TextEdit id="KeyInput" width="0.7" placeholder="Enter device local key" />
        </Item>
        
        <Item layout="hbox" marginTop="8">
          <Text width="120" layoutAlignment="center">Device ID:</Text>
          <TextEdit id="DeviceIdInput" width="0.7" placeholder="Enter device ID (gwId)" />
        </Item>
        
        <Item layout="hbox" marginTop="8">
          <Text width="120" layoutAlignment="center">LED Count:</Text>
          <Slider id="LedCountSlider" width="0.5" minValue="1" maxValue="500" step="1" value="72" />
          <TextEdit id="LedCountInput" width="60" numeric="true" />
        </Item>

        <Rectangle height="8" />
        
        <!-- Brightness Control -->
        <Item layout="hbox" marginTop="8">
          <Text width="120" layoutAlignment="center">Brightness:</Text>
          <Slider id="BrightnessSlider" width="0.5" minValue="0" maxValue="100" step="1" value="100" />
          <TextEdit id="BrightnessInput" width="60" numeric="true" />
        </Item>

        <Rectangle height="8" />
        
        <!-- Options -->
        <Item layout="hbox" marginTop="12">
          <Item width="0.5" layout="hbox">
            <Checkbox id="AutoConnectCheck" text="Auto Connect" checked="true" />
          </Item>
          <Item width="0.5" layout="hbox">
            <Checkbox id="DebugModeCheck" text="Debug Mode" />
          </Item>
        </Item>
        
        <!-- Save Button -->
        <Item layout="hbox" marginTop="16" layoutAlignment="center">
          <Button id="SaveConfigButton" width="200" height="40" textSize="14">Save Configuration</Button>
        </Item>
      </Item>
    </Rectangle>

    <!-- Device Discovery Panel -->
    <Rectangle fillColor="#292A2D" cornerRadius="8" marginTop="16">
      <Item layout="vbox" marginTop="12" marginBottom="12" marginLeft="16" marginRight="16">
        <Text textSize="18" fontStyle="bold">Device Discovery</Text>
        
        <Item layout="hbox" marginTop="12" layoutAlignment="center">
          <Button id="StartDiscoveryButton" width="180" height="36" textSize="14" marginRight="16">Start Discovery</Button>
          <Button id="StopDiscoveryButton" width="180" height="36" textSize="14">Stop Discovery</Button>
        </Item>
        
        <Rectangle fillColor="#1E1F21" cornerRadius="4" marginTop="12">
          <List id="DiscoveredDevicesList" height="120" />
        </Rectangle>
        
        <Text id="DiscoveryStatus" marginTop="8">No devices discovered yet</Text>
      </Item>
    </Rectangle>

    <!-- Log Panel -->
    <Rectangle fillColor="#292A2D" cornerRadius="8" marginTop="16">
      <Item layout="vbox" marginTop="12" marginBottom="12" marginLeft="16" marginRight="16">
        <Item layout="hbox">
          <Text textSize="18" fontStyle="bold">Log</Text>
          <Item width="0.7" />
          <Button id="ClearLogButton" width="100" height="28" textSize="12">Clear Log</Button>
        </Item>
        
        <Rectangle fillColor="#1E1F21" cornerRadius="4" marginTop="12">
          <TextArea id="LogTextArea" height="100" readOnly="true" />
        </Rectangle>
      </Item>
    </Rectangle>
  </Window>
</Ui>
  `;
}

/**
 * Initialize the UI
 * Connects UI elements to their handlers
 */
export function InitializeUI() {
  try {
    // Get current parameter values
    const ip = device.getParameter("IP");
    const key = device.getParameter("Key");
    const deviceId = device.getParameter("Device ID");
    const ledCount = device.getParameter("LED Count");
    const brightness = device.getParameter("Brightness");
    const autoConnect = device.getParameter("Auto Connect");
    const debugMode = device.getParameter("Debug Mode");
    const connectionStatus = device.getParameter("Connection Status");
    
    // Set initial UI values
    ui.IpInput.text = ip || "";
    ui.KeyInput.text = key || "";
    ui.DeviceIdInput.text = deviceId || "";
    ui.LedCountSlider.value = ledCount;
    ui.LedCountInput.text = ledCount.toString();
    ui.BrightnessSlider.value = brightness;
    ui.BrightnessInput.text = brightness.toString();
    ui.AutoConnectCheck.checked = autoConnect;
    ui.DebugModeCheck.checked = debugMode;
    
    // Update status display
    ui.ConnectionStatus.text = connectionStatus;
    ui.DeviceId.text = deviceId || "Not configured";
    ui.IpAddress.text = ip || "Not configured";
    ui.LedCount.text = ledCount.toString();
    
    // Connect event handlers
    ui.ConnectButton.onClick = connectDevice;
    ui.DisconnectButton.onClick = disconnectDevice;
    ui.RefreshButton.onClick = refreshDeviceInfo;
    ui.SaveConfigButton.onClick = saveConfiguration;
    ui.StartDiscoveryButton.onClick = startDeviceDiscovery;
    ui.StopDiscoveryButton.onClick = stopDeviceDiscovery;
    ui.ClearLogButton.onClick = clearLog;
    
    // Slider change events
    ui.LedCountSlider.onValueChange = (value) => {
      ui.LedCountInput.text = value.toString();
      device.setParameter("LED Count", parseInt(value));
    };
    
    ui.BrightnessSlider.onValueChange = (value) => {
      ui.BrightnessInput.text = value.toString();
      device.setParameter("Brightness", parseInt(value));
    };
    
    // Text input change events
    ui.LedCountInput.onTextChanged = (text) => {
      const value = parseInt(text);
      if (!isNaN(value) && value >= 1 && value <= 500) {
        ui.LedCountSlider.value = value;
        device.setParameter("LED Count", value);
      }
    };
    
    ui.BrightnessInput.onTextChanged = (text) => {
      const value = parseInt(text);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        ui.BrightnessSlider.value = value;
        device.setParameter("Brightness", value);
      }
    };
    
    // Checkbox events
    ui.AutoConnectCheck.onCheckedChange = (checked) => {
      device.setParameter("Auto Connect", checked);
    };
    
    ui.DebugModeCheck.onCheckedChange = (checked) => {
      device.setParameter("Debug Mode", checked);
    };
    
    // Initialize discovered devices list
    ui.DiscoveredDevicesList.onItemSelected = (item) => {
      if (item && item.data) {
        ui.IpInput.text = item.data.ip || "";
        ui.DeviceIdInput.text = item.data.gwId || "";
        logMessage(`Selected device: ${item.text}`);
      }
    };
    
    logMessage("UI initialized");
  } catch (error) {
    console.error(`Error initializing UI: ${error}`);
  }
}

/**
 * Log a message to the UI log area
 */
export function logMessage(message) {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    // Append to log textarea
    ui.LogTextArea.text = ui.LogTextArea.text + "\n" + formattedMessage;
    
    // Auto-scroll to bottom
    ui.LogTextArea.scrollToEnd();
  } catch (error) {
    console.error(`Error logging message: ${error}`);
  }
}

/**
 * Connect to the device using current configuration
 */
function connectDevice() {
  try {
    const ip = ui.IpInput.text;
    const key = ui.KeyInput.text;
    const deviceId = ui.DeviceIdInput.text;
    
    if (!ip || !key || !deviceId) {
      logMessage("Error: Please fill in all device details (IP, Key, and Device ID)");
      return;
    }
    
    // Update device parameters
    device.setParameter("IP", ip);
    device.setParameter("Key", key);
    device.setParameter("Device ID", deviceId);
    
    // Trigger connection in the main script
    device.setParameter("Connection Status", "Connecting...");
    ui.ConnectionStatus.text = "Connecting...";
    
    logMessage(`Connecting to device at ${ip}...`);
    
    // The actual connection will be handled by the main script (index.js)
    // which reacts to parameter changes
  } catch (error) {
    logMessage(`Error connecting: ${error}`);
  }
}

/**
 * Disconnect from the device
 */
function disconnectDevice() {
  try {
    logMessage("Disconnecting from device...");
    
    // The actual disconnection will be handled by the main script (index.js)
    // We just need to signal that we want to disconnect by changing the auto-connect parameter
    const autoConnect = device.getParameter("Auto Connect");
    if (autoConnect) {
      device.setParameter("Auto Connect", false);
      ui.AutoConnectCheck.checked = false;
    }
    
    // This will be picked up by the main script to initiate disconnection
    device.setParameter("Connection Status", "Disconnecting...");
    ui.ConnectionStatus.text = "Disconnecting...";
  } catch (error) {
    logMessage(`Error disconnecting: ${error}`);
  }
}

/**
 * Refresh device information
 */
function refreshDeviceInfo() {
  try {
    logMessage("Refreshing device information...");
    
    // This will be a custom event that the main script will listen for
    device.setParameter("Request", "refresh_device_info");
    
    // Update UI elements to reflect current parameter values
    ui.ConnectionStatus.text = device.getParameter("Connection Status");
    ui.DeviceId.text = device.getParameter("Device ID") || "Not configured";
    ui.IpAddress.text = device.getParameter("IP") || "Not configured";
    ui.LedCount.text = device.getParameter("LED Count").toString();
  } catch (error) {
    logMessage(`Error refreshing device info: ${error}`);
  }
}

/**
 * Save the current configuration
 */
function saveConfiguration() {
  try {
    const ip = ui.IpInput.text;
    const key = ui.KeyInput.text;
    const deviceId = ui.DeviceIdInput.text;
    const ledCount = parseInt(ui.LedCountInput.text);
    const brightness = parseInt(ui.BrightnessInput.text);
    const autoConnect = ui.AutoConnectCheck.checked;
    const debugMode = ui.DebugModeCheck.checked;
    
    // Validate inputs
    if (!ip) {
      logMessage("Error: IP address is required");
      return;
    }
    
    if (!key) {
      logMessage("Error: Local key is required");
      return;
    }
    
    if (!deviceId) {
      logMessage("Error: Device ID is required");
      return;
    }
    
    if (isNaN(ledCount) || ledCount < 1 || ledCount > 500) {
      logMessage("Error: LED count must be between 1 and 500");
      return;
    }
    
    if (isNaN(brightness) || brightness < 0 || brightness > 100) {
      logMessage("Error: Brightness must be between 0 and 100");
      return;
    }
    
    // Update all parameters
    device.setParameter("IP", ip);
    device.setParameter("Key", key);
    device.setParameter("Device ID", deviceId);
    device.setParameter("LED Count", ledCount);
    device.setParameter("Brightness", brightness);
    device.setParameter("Auto Connect", autoConnect);
    device.setParameter("Debug Mode", debugMode);
    
    // Update status display
    ui.DeviceId.text = deviceId;
    ui.IpAddress.text = ip;
    ui.LedCount.text = ledCount.toString();
    
    logMessage("Configuration saved");
    
    // If auto-connect is enabled, attempt to connect
    if (autoConnect) {
      connectDevice();
    }
  } catch (error) {
    logMessage(`Error saving configuration: ${error}`);
  }
}

/**
 * Start device discovery process
 */
function startDeviceDiscovery() {
  try {
    logMessage("Starting device discovery...");
    ui.DiscoveryStatus.text = "Scanning for devices...";
    
    // Clear previous discoveries
    ui.DiscoveredDevicesList.clear();
    
    // Trigger discovery in the main script
    device.setParameter("Request", "start_discovery");
    
    // Mock discovery results for testing UI
    // In the real implementation, these would come from the actual discovery process
    setTimeout(() => {
      // Example discovered device
      const mockDevice = {
        name: "Tuya LED Strip",
        ip: "192.168.1.129",
        gwId: "bfafad43febddb888apxbj",
        product_id: "led_strip_1"
      };
      
      addDiscoveredDevice(mockDevice);
      
      ui.DiscoveryStatus.text = "Found 1 device";
    }, 3000);
  } catch (error) {
    logMessage(`Error starting discovery: ${error}`);
    ui.DiscoveryStatus.text = `Error: ${error}`;
  }
}

/**
 * Stop the device discovery process
 */
function stopDeviceDiscovery() {
  try {
    logMessage("Stopping device discovery...");
    
    // Signal the main script to stop discovery
    device.setParameter("Request", "stop_discovery");
    
    ui.DiscoveryStatus.text = "Discovery stopped";
  } catch (error) {
    logMessage(`Error stopping discovery: ${error}`);
  }
}

/**
 * Add a discovered device to the list
 */
export function addDiscoveredDevice(deviceInfo) {
  try {
    if (!deviceInfo || !deviceInfo.ip || !deviceInfo.gwId) {
      return;
    }
    
    const deviceName = deviceInfo.name || "Unknown Tuya Device";
    const listItem = {
      text: `${deviceName} (${deviceInfo.ip})`,
      data: deviceInfo
    };
    
    ui.DiscoveredDevicesList.addItem(listItem);
    logMessage(`Found device: ${deviceName} at ${deviceInfo.ip}`);
  } catch (error) {
    logMessage(`Error adding discovered device: ${error}`);
  }
}

/**
 * Clear the log area
 */
function clearLog() {
  try {
    ui.LogTextArea.text = "";
    logMessage("Log cleared");
  } catch (error) {
    console.error(`Error clearing log: ${error}`);
  }
}

/**
 * Update connection status in the UI
 */
export function updateConnectionStatus(status) {
  try {
    ui.ConnectionStatus.text = status;
    logMessage(`Connection status: ${status}`);
  } catch (error) {
    console.error(`Error updating connection status: ${error}`);
  }
}

/**
 * Handle device events from the main script
 */
export function handleDeviceEvent(eventType, data) {
  try {
    switch (eventType) {
      case "connected":
        updateConnectionStatus("Connected");
        logMessage(`Connected to device at ${data.ip}`);
        break;
      
      case "disconnected":
        updateConnectionStatus("Disconnected");
        logMessage("Disconnected from device");
        break;
      
      case "connection_error":
        updateConnectionStatus(`Error: ${data.error}`);
        logMessage(`Connection error: ${data.error}`);
        break;
      
      case "device_info":
        // Update UI with device info
        if (data) {
          if (data.name) {
            logMessage(`Device name: ${data.name}`);
          }
          if (data.state) {
            logMessage(`Device state: ${JSON.stringify(data.state)}`);
          }
        }
        break;
      
      case "discovery_result":
        if (data && Array.isArray(data.devices)) {
          ui.DiscoveryStatus.text = `Found ${data.devices.length} device(s)`;
          
          data.devices.forEach(device => {
            addDiscoveredDevice(device);
          });
        }
        break;
      
      default:
        logMessage(`Unknown event: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error handling device event: ${error}`);
  }
}