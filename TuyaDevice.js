/**
 * TuyaDevice.js
 * Representa un dispositivo Tuya conectado
 */

// CORREGIR: Eliminar módulos nativos no compatibles
// const EventEmitter = require('events'); // ELIMINAR
// const crypto = require('crypto'); // ELIMINAR
const EventEmitter = require('./utils/EventEmitter.js'); // AGREGAR
const TuyaPacket = require('./utils/TuyaPacket.js'); // RUTA CORREGIDA

class TuyaDevice extends EventEmitter {
    constructor(options) {
        super();
        
        if (!options.id) {
            throw new Error('Device ID is required');
        }
        
        this.id = options.id;
        this.ip = options.ip;
        this.key = options.key;
        this.name = options.name || `Tuya Device ${this.id.substring(0, 8)}`;
        this.version = options.version || '3.5';
        this.port = options.port || 40001;
        this.controller = options.controller;
        
        this.isConnected = false;
        this.sessionKey = null;
        this.lastSequence = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 5000;
        this.connectionTimeout = options.connectionTimeout || 10000;
        this.ledCount = options.ledCount || 1;
        
        this.lastColors = null;
        this.pendingCommands = new Map();
        this.commandTimeouts = new Map();
    }
    
    /**
     * Conecta al dispositivo iniciando el handshake
     * @returns {Promise<TuyaDevice>} - Promesa que se resuelve cuando la conexión es exitosa
     */
    connect() {
        if (this.isConnected) {
            return Promise.resolve(this);
        }
        
        if (!this.ip || !this.key) {
            return Promise.reject(new Error('Device IP and key are required'));
        }
        
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, this.connectionTimeout);
            
            this._startHandshake()
                .then(() => {
                    clearTimeout(timeoutId);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connected', this);
                    resolve(this);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    
                    // Incrementar intentos de reconexión
                    this.reconnectAttempts++;
                    
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        console.log(`Connection attempt ${this.reconnectAttempts} failed, retrying in ${this.reconnectDelay}ms...`);
                        setTimeout(() => {
                            this.connect()
                                .then(resolve)
                                .catch(reject);
                        }, this.reconnectDelay);
                    } else {
                        this.reconnectAttempts = 0;
                        reject(error);
                    }
                });
        });
    }
    
    /**
     * Inicia el proceso de handshake para negociar la clave de sesión
     * @returns {Promise<void>}
     * @private
     */
    _startHandshake() {
        return new Promise((resolve, reject) => {
            if (this.version === '3.1') {
                // Para dispositivos v3.1 no hay handshake
                resolve();
                return;
            }
            
            // CORREGIR: Usar implementación propia para generar random
            const clientRandom = this._generateRandomHex(16);
            
            // Crear payload para solicitud de handshake
            const payload = JSON.stringify({
                uuid: this._generateUUID(),
                t: Math.floor(Date.now() / 1000),
                gwId: this.id,
                random: clientRandom
            });
            
            try {
                // Construir paquete de solicitud handshake (0x05)
                const packet = TuyaPacket.buildV35Packet(
                    payload,
                    TuyaPacket.TYPES.SESS_KEY_NEG_REQ,
                    this.id,
                    this.key,
                    true // Es handshake, almacenar el nonce
                );
                
                // Crear promesa para esperar respuesta
                const responsePromise = this._waitForResponse(TuyaPacket.TYPES.SESS_KEY_NEG_RESP);
                
                // Enviar paquete
                const broadcastIp = this.controller.getBroadcastAddress(this.ip);
                this.controller.sendUdpPacket(packet, broadcastIp, this.port)
                    .then(() => {
                        // Esperar respuesta
                        responsePromise
                            .then(response => {
                                // Procesar respuesta y derivar sessionKey
                                this.sessionKey = this._deriveSessionKey(response, clientRandom);
                                resolve();
                            })
                            .catch(reject);
                    })
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Deriva la clave de sesión a partir de la respuesta del dispositivo
     * @param {Object} response - Respuesta parseada del dispositivo
     * @param {string} clientRandom - Random del cliente enviado en la solicitud
     * @returns {string} - Clave de sesión en formato hex
     * @private
     */
    _deriveSessionKey(response, clientRandom) {
        // Extraer deviceRandom de la respuesta
        const deviceRandom = response.random || '';
        
        // CORREGIR: Usar implementación propia de MD5
        const md5Input = this.key + clientRandom + deviceRandom;
        return this._calculateMD5(md5Input);
    }
    
    /**
     * Genera un string hexadecimal aleatorio
     * @param {number} length - Longitud en bytes
     * @returns {string} - String hexadecimal aleatorio
     * @private
     */
    _generateRandomHex(length) {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length * 2; i++) {
            result += chars[Math.floor(Math.random() * 16)];
        }
        return result;
    }
    
    /**
     * Genera un UUID simple
     * @returns {string} - UUID generado
     * @private
     */
    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * Calcula MD5 de un string
     * @param {string} input - Input para calcular MD5
     * @returns {string} - Hash MD5 en hexadecimal
     * @private
     */
    _calculateMD5(input) {
        // Implementación simple de MD5 - se mejorará con CryptoJS
        // Por ahora usar una implementación básica
        return this._simpleHash(input);
    }
    
    /**
     * Hash simple temporal hasta implementar CryptoJS
     * @param {string} input - Input para hash
     * @returns {string} - Hash simple
     * @private
     */
    _simpleHash(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir a 32-bit
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }
    
    /**
     * Espera por un tipo específico de respuesta
     * @param {number} messageType - Tipo de mensaje a esperar
     * @param {number} timeout - Tiempo de espera en ms
     * @returns {Promise<Object>} - Promesa que se resuelve con la respuesta
     * @private
     */
    _waitForResponse(messageType, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.removeListener('response', handler);
                reject(new Error(`Timeout waiting for response type ${messageType.toString(16)}`));
            }, timeout);
            
            const handler = (response) => {
                if (response.messageType === messageType) {
                    clearTimeout(timeoutId);
                    this.removeListener('response', handler);
                    resolve(response);
                }
            };
            
            this.on('response', handler);
        });
    }
    
    /**
     * Maneja una respuesta recibida del dispositivo
     * @param {Buffer} message - Mensaje recibido
     * @param {Object} rinfo - Información del remitente
     */
    handleResponse(message, rinfo) {
        try {
            // Verificar que la respuesta viene del dispositivo correcto
            if (rinfo.address !== this.ip) {
                return;
            }
            
            // Parsear el paquete
            const key = this.sessionKey || this.key;
            const response = TuyaPacket.parsePacket(message, key);
            
            // Actualizar estado de conexión si no estaba conectado
            if (!this.isConnected && response.messageType === TuyaPacket.TYPES.SESS_KEY_NEG_RESP) {
                this.isConnected = true;
                this.emit('connected', this);
            }
            
            // Emitir evento de respuesta
            this.emit('response', response);
            
            // Emitir data si hay datos
            if (response.data) {
                this.emit('data', response.data);
            }
            
        } catch (error) {
            console.error('Error handling device response:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Desconecta el dispositivo
     */
    disconnect() {
        this.isConnected = false;
        this.sessionKey = null;
        this.emit('disconnected', this);
    }
    
    /**
     * Envía un comando al dispositivo
     * @param {Object|string} command - Comando a enviar (objeto o string JSON)
     * @param {number} timeout - Tiempo de espera para respuesta en ms
     * @returns {Promise<Object>} - Promesa que se resuelve con la respuesta
     */
    sendCommand(command, timeout = 5000) {
        if (!this.isConnected) {
            return this.connect().then(() => this.sendCommand(command, timeout));
        }
        
        const commandStr = typeof command === 'string' ? command : JSON.stringify(command);
        
        return new Promise((resolve, reject) => {
            try {
                // Generar ID único para este comando
                const commandId = Date.now().toString();
                
                // Registrar promesa pendiente
                this.pendingCommands.set(commandId, { resolve, reject });
                
                // Configurar timeout
                const timeoutId = setTimeout(() => {
                    if (this.pendingCommands.has(commandId)) {
                        const pendingCommand = this.pendingCommands.get(commandId);
                        this.pendingCommands.delete(commandId);
                        pendingCommand.reject(new Error('Command timeout'));
                    }
                }, timeout);
                
                this.commandTimeouts.set(commandId, timeoutId);
                
                // Construir y enviar paquete
                let packet;
                if (this.version === '3.1') {
                    packet = TuyaPacket.buildV31Packet(
                        commandStr,
                        TuyaPacket.TYPES.CONTROL_NEW,
                        this.key
                    );
                } else {
                    packet = TuyaPacket.buildV35Packet(
                        commandStr,
                        TuyaPacket.TYPES.SESS_KEY_CMD,
                        this.id,
                        this.sessionKey || this.key
                    );
                }
                
                // Enviar paquete
                const broadcastIp = this.controller.getBroadcastAddress(this.ip);
                this.controller.sendUdpPacket(packet, broadcastIp, this.port)
                    .catch(error => {
                        clearTimeout(timeoutId);
                        this.commandTimeouts.delete(commandId);
                        this.pendingCommands.delete(commandId);
                        reject(error);
                    });
                
                // Esperar respuesta (la promesa se resolverá en handleResponse)
                this._waitForResponse(TuyaPacket.TYPES.SESS_KEY_CMD, timeout)
                    .then(response => {
                        clearTimeout(timeoutId);
                        this.commandTimeouts.delete(commandId);
                        
                        if (this.pendingCommands.has(commandId)) {
                            const pendingCommand = this.pendingCommands.get(commandId);
                            this.pendingCommands.delete(commandId);
                            pendingCommand.resolve(response);
                        }
                    })
                    .catch(error => {
                        clearTimeout(timeoutId);
                        this.commandTimeouts.delete(commandId);
                        
                        if (this.pendingCommands.has(commandId)) {
                            const pendingCommand = this.pendingCommands.get(commandId);
                            this.pendingCommands.delete(commandId);
                            pendingCommand.reject(error);
                        }
                    });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Establece los colores de los LEDs del dispositivo
     * @param {Array<{r: number, g: number, b: number}>} colors - Array de colores RGB
     * @returns {Promise<Object>} - Promesa que se resuelve con la respuesta
     */
    async setColors(colors) {
        if (!Array.isArray(colors)) {
            throw new Error('Colors must be an array');
        }
        
        // Guardar los colores actuales
        this.lastColors = colors;
        
        // Implementación simplificada para un solo color (promedio)
        // En una implementación real, se procesarían todos los colores
        const avgColor = this._calculateAverageColor(colors);
        
        // Convertir a formato HSV que usan los dispositivos Tuya
        const tuyaColor = this._convertRgbToTuyaColor(avgColor.r, avgColor.g, avgColor.b);
        
        // Crear comando con valores DPS (datapoints)
        const command = {
            devId: this.id,
            gwId: this.id,
            uid: '',
            t: Math.floor(Date.now() / 1000),
            dps: {
                '1': true,        // Encendido
                '2': 'colour',    // Modo color (no blanco)
                '5': tuyaColor    // Valor de color en formato HSV
            }
        };
        
        // Enviar comando
        return this.sendCommand(command);
    }
    
    /**
     * Calcula el color promedio de un array de colores
     * @param {Array<{r: number, g: number, b: number}>} colors - Array de colores RGB
     * @returns {{r: number, g: number, b: number}} - Color promedio
     * @private
     */
    _calculateAverageColor(colors) {
        if (colors.length === 0) {
            return { r: 0, g: 0, b: 0 };
        }
        
        const sum = colors.reduce((acc, color) => {
            return {
                r: acc.r + color.r,
                g: acc.g + color.g,
                b: acc.b + color.b
            };
        }, { r: 0, g: 0, b: 0 });
        
        return {
            r: Math.round(sum.r / colors.length),
            g: Math.round(sum.g / colors.length),
            b: Math.round(sum.b / colors.length)
        };
    }
    
    /**
     * Convierte un color RGB a formato HSV de Tuya
     * @param {number} r - Componente rojo (0-255)
     * @param {number} g - Componente verde (0-255)
     * @param {number} b - Componente azul (0-255)
     * @returns {string} - Color en formato Tuya HSV hexadecimal
     * @private
     */
    _convertRgbToTuyaColor(r, g, b) {
        // Esta es una implementación simplificada, la real debe adaptarse al formato específico de Tuya
        
        // Normalizar RGB a [0,1]
        const rf = r / 255;
        const gf = g / 255;
        const bf = b / 255;
        
        // Calcular valores para HSV
        const max = Math.max(rf, gf, bf);
        const min = Math.min(rf, gf, bf);
        const delta = max - min;
        
        // Calcular matiz (H)
        let h = 0;
        if (delta !== 0) {
            if (max === rf) {
                h = ((gf - bf) / delta) % 6;
            } else if (max === gf) {
                h = (bf - rf) / delta + 2;
            } else {
                h = (rf - gf) / delta + 4;
            }
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        
        // Calcular saturación (S)
        const s = max === 0 ? 0 : Math.round((delta / max) * 100);
        
        // Calcular valor (V)
        const v = Math.round(max * 100);
        
        // Convertir a formato Tuya: "h,s,v"
        // Luego codificar a hexadecimal
        const hsvStr = `${h},${s},${v}`;
        const hex = Buffer.from(hsvStr).toString('hex');
        
        return hex;
    }
    
    /**
     * Establece la cantidad de LEDs del dispositivo
     * @param {number} count - Cantidad de LEDs
     * @returns {Promise<void>}
     */
    async setLedCount(count) {
        if (!Number.isInteger(count) || count <= 0) {
            throw new Error('LED count must be a positive integer');
        }
        
        this.ledCount = count;
        
        // Algunos dispositivos requieren configurar la cantidad de LEDs
        // Esta es una implementación genérica que podría necesitar adaptación
        
        const command = {
            devId: this.id,
            gwId: this.id,
            uid: '',
            t: Math.floor(Date.now() / 1000),
            dps: {
                // Algunos dispositivos usan datapoints específicos para la cantidad de LEDs
                // Por ejemplo: '25': count
            }
        };
        
        // Solo enviar si hay un datapoint específico para el conteo de LEDs
        // De lo contrario, simplemente actualizar el valor local
        // return this.sendCommand(command);
        
        return Promise.resolve();
    }
}

module.exports = TuyaDevice;