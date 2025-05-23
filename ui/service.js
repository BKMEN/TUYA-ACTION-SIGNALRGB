/**
 * Servicio simplificado para UI - funcionalidad delegada a index.js
 */

// Funciones de utilidad para QML si es necesario
const ServiceHelper = {
    formatDeviceId: (id) => {
        return id ? id.slice(-8) : 'Unknown';
    },
    
    validateLocalKey: (key) => {
        return key && key.length === 32 && /^[a-fA-F0-9]+$/.test(key);
    },
    
    getStatusText: (device) => {
        if (!device) return 'Unknown';
        if (device.initialized) return 'Connected';
        if (device.enabled && device.localKey) return 'Connecting...';
        if (device.localKey) return 'Configured';
        return 'Not Configured';
    }
};

// Exportar para uso si es necesario
export default ServiceHelper;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceHelper;
}