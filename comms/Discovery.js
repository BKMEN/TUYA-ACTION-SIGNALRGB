// comms/Discovery.js
/**
 * Clase para descubrir dispositivos Tuya en la red local.
 * Implementa el protocolo de descubrimiento UDP de Tuya y emite eventos
 * cuando se encuentran dispositivos.
 * 
 * @author BKMEN
 * @version 1.0.0
 */

const dgram = require('dgram');
const EventEmitter = require('events');
const crypto = require('crypto');
const os = require('os');

class TuyaDiscovery extends EventEmitter {
    /**
     * Constructor para el sistema de descubrimiento de dispositivos Tuya
     * @param {Object} options - Opciones de configuración
     * @param {number} options.port - Puerto UDP para la búsqueda (default: 6667)
     * @param {number} options.timeout - Tiempo de espera en ms (default: 5000)
     * @param {string} options.broadcastAddress - Dirección de broadcast (default: 255.255.255.255)
     * @param {number} options.retries - Número de intentos de descubrimiento (default: 3)
     * @param {number} options.retryDelay - Retraso entre intentos en ms (default: 1000)
     * @param {boolean} options.debugMode - Modo de debug (default: false)
     */
    constructor(options = {}) {
        super();
        
        // Parámetros de configuración con valores por defecto
        this.port = options.port || 6667;
        this.timeout = options.timeout || 5000;
        this.broadcastAddress = options.broadcastAddress || this._getBroadcastAddresses();
        this.retries = options.retries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.debugMode = options.debugMode || false;
        
        // Variables internas
        this.socket = null;
        this.devices = {};
        this.discoveryRunning = false;
        this.currentRetry = 0;
        this.discoveryTimer = null;
    }

    /**
     * Inicia el proceso de descubrimiento de dispositivos
     * @returns {Promise} Promise que se resuelve cuando finaliza el descubrimiento
     */
    discover() {
        return new Promise((resolve, reject) => {
            if (this.discoveryRunning) {
                reject(new Error('Discovery already running'));
                return;
            }
            
            this.discoveryRunning = true;
            this.devices = {};
            this.currentRetry = 0;
            
            this._log('Starting Tuya device discovery');
            this._startDiscovery();
            
            // Configurar el evento done para resolver la promesa
            this.once('done', (devices) => {
                this.discoveryRunning = false;
                resolve(devices);
            });
            
            // Configurar manejo de error
            this.once('error', (err) => {
                this.discoveryRunning = false;
                if (this.socket) {
                    this.socket.close();
                    this.socket = null;
                }
                reject(err);
            });
        });
    }
    
    /**
     * Detiene el proceso de descubrimiento actual
     */
    stop() {
        if (this.discoveryRunning) {
            this._log('Stopping discovery process');
            
            clearTimeout(this.discoveryTimer);
            this.discoveryRunning = false;
            
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            
            this.emit('done', Object.values(this.devices));
        }
    }
    
    /**
     * Actualiza los dispositivos (puede llamarse periódicamente)
     * @returns {Promise} Promesa con la lista actualizada de dispositivos
     */
    update() {
        return this.discover();
    }
    
    /**
     * Método privado para iniciar el proceso de descubrimiento
     * @private
     */
    _startDiscovery() {
        try {
            // Crear socket UDP
            this.socket = dgram.createSocket('udp4');
            
            // Configurar listeners
            this.socket.on('error', (err) => {
                this._log(`Socket error: ${err.message}`);
                this.emit('error', err);
            });
            
            this.socket.on('message', this._handleDiscoveryResponse.bind(this));
            
            // Bind y configuración
            this.socket.bind(() => {
                this.socket.setBroadcast(true);
                this._sendDiscoveryPackets();
                
                // Configurar timeout
                this.discoveryTimer = setTimeout(() => {
                    if (this.currentRetry < this.retries - 1) {
                        this.currentRetry++;
                        this._log(`Retry ${this.currentRetry}/${this.retries}`);
                        this._sendDiscoveryPackets();
                    } else {
                        this._finalizeDiscovery();
                    }
                }, this.timeout);
            });
        } catch (err) {
            this._log(`Error starting discovery: ${err.message}`);
            this.emit('error', err);
        }
    }
    
    /**
     * Envía paquetes de descubrimiento a las direcciones de broadcast
     * @private
     */
    _sendDiscoveryPackets() {
        // Paquete de descubrimiento estándar Tuya (prefijo + comando de descubrimiento)
        const discoveryPacket = Buffer.from('000055aa00000000000000070000000100000000', 'hex');
        const addresses = Array.isArray(this.broadcastAddress) ? 
                         this.broadcastAddress : [this.broadcastAddress];
        
        addresses.forEach(address => {
            this._log(`Sending discovery packet to ${address}:${this.port}`);
            this.socket.send(discoveryPacket, 0, discoveryPacket.length, this.port, address, (err) => {
                if (err) {
                    this._log(`Error sending to ${address}: ${err.message}`);
                }
            });
        });
    }
    
    /**
     * Procesa las respuestas de los dispositivos Tuya
     * @param {Buffer} msg - Mensaje recibido
     * @param {Object} rinfo - Información del remitente
     * @private
     */
    _handleDiscoveryResponse(msg, rinfo) {
        try {
            // Verificar firma Tuya en el encabezado (0x000055AA)
            if (msg.length < 16 || msg.slice(0, 4).toString('hex') !== '000055aa') {
                return; // No es un paquete Tuya válido
            }
            
            // Extraer información básica
            const deviceInfo = this._parseDeviceInfo(msg, rinfo);
            
            if (deviceInfo && deviceInfo.id) {
                // Si es un dispositivo nuevo o actualizado
                if (!this.devices[deviceInfo.id] || 
                    JSON.stringify(this.devices[deviceInfo.id]) !== JSON.stringify(deviceInfo)) {
                    
                    this.devices[deviceInfo.id] = deviceInfo;
                    this._log(`Device found: ${deviceInfo.id} (${deviceInfo.ip})`);
                    
                    // Emitir evento para el dispositivo
                    this.emit('device', deviceInfo);
                }
            }
        } catch (err) {
            this._log(`Error processing response: ${err.message}`);
        }
    }
    
    /**
     * Analiza la información del dispositivo desde el paquete de respuesta
     * @param {Buffer} msg - Mensaje recibido
     * @param {Object} rinfo - Información del remitente
     * @returns {Object} Información del dispositivo
     * @private
     */
    _parseDeviceInfo(msg, rinfo) {
        // Extraer campo de longitud total y verificar integridad del paquete
        const frameSize = msg.readUInt32BE(12);
        if (msg.length < frameSize) {
            return null; // Paquete incompleto
        }
        
        try {
            // Extraer ID del dispositivo - puede estar en diferentes posiciones según versión
            // Buscamos una cadena ASCII válida en posiciones típicas
            let devId = '';
            let foundId = false;
            
            // Intentar varias ubicaciones comunes (estas pueden variar según firmware)
            const possiblePositions = [20, 24, 40];
            
            for (const pos of possiblePositions) {
                if (pos + 16 <= msg.length) {
                    // Extraer 16 bytes y ver si forman un ID ASCII válido
                    const potentialId = msg.slice(pos, pos + 16).toString().replace(/\0/g, '');
                    // Los ID Tuya normalmente son alfanuméricos de ~20 caracteres
                    if (/^[a-zA-Z0-9]{10,22}$/.test(potentialId)) {
                        devId = potentialId;
                        foundId = true;
                        break;
                    }
                }
            }
            
            if (!foundId) {
                // Si no encontramos un ID en las posiciones comunes, generamos un ID basado
                // en la dirección IP y MAC como fallback
                devId = `unknown_${rinfo.address}_${Date.now()}`;
            }
            
            // Intentar extraer otra información útil
            // Versión del protocolo (comúnmente en los bytes 11-12)
            const protoVer = msg[11] ? `3.${msg[11]}` : '3.3'; // Default a 3.3 si no se encuentra
            
            // Creamos una huella única del dispositivo
            const deviceFingerprint = crypto
                .createHash('md5')
                .update(`${rinfo.address}:${rinfo.port}:${devId}`)
                .digest('hex')
                .substring(0, 8);
                
            return {
                id: devId,
                ip: rinfo.address,
                port: rinfo.port,
                protocolVersion: protoVer,
                fingerprint: deviceFingerprint,
                lastSeen: Date.now(),
                raw: msg.toString('hex').substring(0, 100) + '...' // Primeros 100 caracteres del hex dump
            };
        } catch (err) {
            this._log(`Error parsing device info: ${err.message}`);
            return null;
        }
    }
    
    /**
     * Finaliza el proceso de descubrimiento
     * @private
     */
    _finalizeDiscovery() {
        this._log(`Discovery complete, found ${Object.keys(this.devices).length} devices`);
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.discoveryRunning = false;
        this.emit('done', Object.values(this.devices));
    }
    
    /**
     * Obtiene las direcciones de broadcast disponibles en el sistema
     * @returns {Array} Lista de direcciones de broadcast
     * @private
     */
    _getBroadcastAddresses() {
        const addresses = [];
        const interfaces = os.networkInterfaces();
        
        // Recorrer todas las interfaces de red
        Object.keys(interfaces).forEach((ifaceName) => {
            interfaces[ifaceName].forEach((iface) => {
                // Solo usar IPv4 y no localhost
                if (iface.family === 'IPv4' && !iface.internal) {
                    // Calcular dirección de broadcast a partir de la dirección IP y máscara
                    const ipParts = iface.address.split('.');
                    const netmaskParts = iface.netmask.split('.');
                    const broadcastParts = ipParts.map((part, i) => {
                        return (part & netmaskParts[i]) | (~netmaskParts[i] & 255);
                    });
                    addresses.push(broadcastParts.join('.'));
                }
            });
        });
        
        // Si no encontramos direcciones, usar la de broadcast general
        if (addresses.length === 0) {
            addresses.push('255.255.255.255');
        }
        
        return addresses;
    }
    
    /**
     * Registra mensajes de debug si el modo debug está activado
     * @param {string} message - Mensaje a registrar
     * @private
     */
    _log(message) {
        if (this.debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[TuyaDiscovery ${timestamp}] ${message}`);
        }
    }
}

module.exports = TuyaDiscovery;

/* EJEMPLO DE USO:

const TuyaDiscovery = require('./comms/Discovery.js');

// Crear instancia con opciones
const discovery = new TuyaDiscovery({ 
    timeout: 6000,
    retries: 2,
    debugMode: true
});

// Escuchar eventos
discovery.on('device', (device) => {
    console.log('Dispositivo encontrado:', device);
});

discovery.on('done', (deviceList) => {
    console.log('Búsqueda finalizada, dispositivos totales:', deviceList.length);
    // Hacer algo con la lista completa de dispositivos
});

discovery.on('error', (err) => {
    console.error('Error en el descubrimiento:', err);
});

// Iniciar descubrimiento (usando promesas)
discovery.discover()
    .then((devices) => {
        console.log(`Descubrimiento completado: ${devices.length} dispositivos encontrados`);
    })
    .catch((err) => {
        console.error('Error:', err);
    });

// Para detener manualmente:
// discovery.stop();
*/