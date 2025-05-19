/**
 * Wrapper para el módulo de Discovery
 */

// Importa la clase Discovery original
const Discovery = require('./comms/Discovery');

// Añade estas funciones para evitar que SignalRGB lo intente cargar como plugin
function VendorId() { return null; }
function ProductId() { return null; }

// Añade estas propiedades al objeto exportado para que SignalRGB lo ignore
Discovery.VendorId = VendorId;
Discovery.ProductId = ProductId;

module.exports = Discovery;
