/**
 * Clase wrapper para TuyaDiscovery
 * Simplemente re-exporta la clase de Discovery.js
 */

// Importar la clase original de comms/Discovery.js
const Discovery = require('./comms/Discovery');

// Re-exportar
module.exports = Discovery;
