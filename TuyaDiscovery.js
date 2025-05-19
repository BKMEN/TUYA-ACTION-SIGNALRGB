/**
 * Wrapper para Discovery
 */

// Crear un objeto simple en lugar de envolver la clase compleja
const TuyaDiscovery = {
    start: function() {
        console.log("TuyaDiscovery: start() called");
        return Promise.resolve();
    },
    
    stop: function() {
        console.log("TuyaDiscovery: stop() called");
        return Promise.resolve();
    },
    
    on: function(event, callback) {
        console.log(`TuyaDiscovery: Added listener for ${event}`);
        // Simulación simple de EventEmitter - en una implementación real
        // se usaría un EventEmitter completo
        return this;
    },
    
    removeAllListeners: function() {
        console.log("TuyaDiscovery: Removed all listeners");
        return this;
    }
};

module.exports = TuyaDiscovery;
