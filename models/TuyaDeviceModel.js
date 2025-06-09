/**
 * Modelo de dispositivo Tuya con persistencia
 * Basado en TuyaDevice.test.js del plugin FU-RAZ
 */

class TuyaDeviceModel {
    constructor(discoveryData = {}) {
        // Datos básicos del dispositivo
        this.id = discoveryData.gwId || discoveryData.id || '';
        this.ip = discoveryData.ip || '';
        // Puerto fijo para negociación GCM; se ignora el puerto recibido en el discovery
        this.port = 6669;
        this.gwId = discoveryData.gwId || this.id;
        this.devId = discoveryData.devId || this.id;
        this.productKey = discoveryData.productKey || '';
        this.version = discoveryData.version || '3.3';
        
        // Configuración del usuario (persistente)
        this.localKey = discoveryData.localKey || discoveryData.key || '';
        this.enabled = discoveryData.enabled || false;
        this.deviceType = discoveryData.deviceType || discoveryData.type || 'LED Strip';
        this.ledCount = discoveryData.ledCount || 1;
        
        // Estado de conexión
        this.sessionKey = null;
        this.negotiationKey = null;
        this.isConnected = false;
        this.initialized = false;
        this.sequenceNumber = 0;
        
        // Metadatos
        this.lastSeen = Date.now();
        
        // Cargar configuración guardada. Si no existen ajustes previos
        // se mantienen los valores proporcionados por discoveryData.
        const loaded = this.loadSettings();
        if (!loaded) {
            // No hay configuración previa almacenada, se usarán los valores
            // proporcionados por el descubrimiento.
        }
    }

    getCurrentConfig() {
        return {
            id: this.id,
            ip: this.ip,
            port: this.port,
            gwId: this.gwId,
            devId: this.devId,
            productKey: this.productKey,
            version: this.version,
            localKey: this.localKey,
            enabled: this.enabled,
            deviceType: this.deviceType,
            ledCount: this.ledCount,
            lastSeen: this.lastSeen
        };
    }

    saveSettings() {
        try {
            const config = this.getCurrentConfig();
            // Usar servicio global si está disponible
            if (typeof service !== 'undefined') {
                service.saveSetting(this.id, 'configData', JSON.stringify(config));
                service.log(`Settings saved for device: ${this.id} (enabled=${this.enabled}, localKey=${this.localKey})`);
            }
            return true;
        } catch (error) {
            if (typeof service !== 'undefined') {
                service.log('Error saving settings for device ' + this.id + ': ' + error.message);
            }
            return false;
        }
    }

    loadSettings() {
        try {
            // Usar servicio global si está disponible
            if (typeof service !== 'undefined') {
                const configData = service.getSetting(this.id, 'configData', '{}');
                const config = JSON.parse(configData);
                
                if (config.localKey) {
                    this.localKey = config.localKey;
                    this.enabled = config.enabled || false;
                    this.deviceType = config.deviceType || 'LED Strip';
                    if (typeof config.ledCount === 'number') {
                        this.ledCount = config.ledCount;
                    }
                    service.log(`Settings loaded for device: ${this.id} (enabled=${this.enabled}, localKey=${this.localKey})`);
                    return true;
                }
            }
        } catch (error) {
            if (typeof service !== 'undefined') {
                service.log('Error loading settings for device ' + this.id + ': ' + error.message);
            }
        }
        return false;
    }

    updateFromDiscovery(discoveryData) {
        this.ip = discoveryData.ip || this.ip;
        // Ignorar el puerto reportado; mantener 6669
        this.version = discoveryData.version || this.version;
        this.lastSeen = Date.now();
    }

    setSessionKey(sessionKey) {
        this.sessionKey = sessionKey;
        this.initialized = true;
        this.saveSettings();
    }

    startSession(sessionKey, negotiationKey) {
        this.sessionKey = sessionKey;
        this.negotiationKey = negotiationKey;
        this.isConnected = true;
        this.initialized = true;
        if (typeof service !== 'undefined') {
            service.log(`✅ Sesión negociada con ${this.id} (${this.ip})`);
        }
        this.saveSettings();
    }

    getNextSequenceNumber() {
        this.sequenceNumber = (this.sequenceNumber + 1) % 0xFFFFFFFF;
        return this.sequenceNumber;
    }

    isReady() {
        return this.enabled && this.localKey && this.sessionKey && this.initialized;
    }
}

// SOLO exportar la clase, SIN ProductId
export default TuyaDeviceModel;

