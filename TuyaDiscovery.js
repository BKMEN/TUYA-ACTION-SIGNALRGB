/**
 * Wrapper para el módulo de Discovery de comunicaciones
 */
const Discovery = require('./comms/Discovery');

// Re-exportar Discovery con el nombre TuyaDiscovery para mantener compatibilidad
module.exports = Discovery;
