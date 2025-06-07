/**
 * TuyaDevice.js
 * Representa un dispositivo Tuya conectado
 */

// CORREGIR: Eliminar módulos nativos no compatibles
import EventEmitter from './utils/EventEmitter.js';
import TuyaPacket from './utils/TuyaPacket.js';

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
     */
    _startHandshake() {
        return new Promise((resolve, reject) => {
            if (this.version === '3.1') {
                // Para dispositivos v3.1 no hay handshake
                resolve();
                return;
            }
            
            // Usar implementación propia para generar random
            const clientRandom = this._generateRandomHex(16);
            
            // Crear payload para solicitud de handshake
            const payload = JSON.stringify({
                uuid: this._generateUUID(),
                t: Math.floor(Date.now() / 1000),
                gwId: this.id,
                random: clientRandom
            });
            
            try {
                // SIMPLIFICAR: Construcción de paquete
                const packet = this._buildHandshakePacket(payload);
                
                // Crear promesa para esperar respuesta
                const responsePromise = this._waitForResponse('SESS_KEY_NEG_RESP');
                
                // SIMPLIFICAR: Envío de paquete
                if (this.controller && typeof this.controller.sendUdpPacket === 'function') {
                    const broadcastIp = this.controller.getBroadcastAddress ? 
                        this.controller.getBroadcastAddress(this.ip) : this.ip;
                    
                    this.controller.sendUdpPacket(packet, broadcastIp, this.port)
                        .then(() => {
                            responsePromise
                                .then(response => {
                                    this.sessionKey = this._deriveSessionKey(response, clientRandom);
                                    resolve();
                                })
                                .catch(reject);
                        })
                        .catch(reject);
                } else {
                    // Fallback si no hay controller
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Construye paquete de handshake simplificado
     */
    _buildHandshakePacket(payload) {
        // Implementación simplificada
        const payloadBuffer = Buffer.from(payload, 'utf8');
        const headerSize = 16;
        const packetSize = headerSize + payloadBuffer.length + 8;
        
        const packet = Buffer.alloc(packetSize);
        
        // Escribir prefijo Tuya
        packet.write('000055aa', 0, 4, 'hex');
        
        // Escribir secuencia
        packet.writeUInt32BE(++this.lastSequence, 4);
        
        // Escribir comando (0x05 para handshake)
        packet.writeUInt32BE(0x05, 8);
        
        // Escribir longitud
        packet.writeUInt32BE(payloadBuffer.length, 12);
        
        // Copiar payload
        payloadBuffer.copy(packet, 16);
        
        // CRC simplificado
        const crc = this._calculateSimpleCRC(packet.slice(0, 16 + payloadBuffer.length));
        packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
        
        // Escribir sufijo
        packet.write('0000aa55', 16 + payloadBuffer.length + 4, 4, 'hex');
        
        return packet;
    }
    
    /**
     * Calcula CRC simple
     */
    _calculateSimpleCRC(buffer) {
        let crc = 0;
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc + buffer[i]) & 0xFFFFFFFF;
        }
        return crc;
    }
    
    /**
     * Deriva la clave de sesión a partir de la respuesta del dispositivo
     */
    _deriveSessionKey(response, clientRandom) {
        const deviceRandom = response.random || '';
        const md5Input = this.key + clientRandom + deviceRandom;
        return this._calculateMD5(md5Input);
    }
    
    /**
     * Genera un string hexadecimal aleatorio
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
     */
    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * Calcula MD5 de un string - implementación simplificada
     */
    _calculateMD5(input) {
        return this._simpleHash(input);
    }
    
    /**
     * Hash simple temporal
     */
    _simpleHash(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
    }
    
    /**
     * Espera por un tipo específico de respuesta
     */
    _waitForResponse(messageType, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.removeListener('response', handler);
                reject(new Error(`Timeout waiting for response type ${messageType}`));
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
     */
    handleResponse(message, rinfo) {
        try {
            if (rinfo.address !== this.ip) {
                return;
            }
            
            // Parseo simplificado
            const response = this._parseResponse(message);
            
            if (!this.isConnected && response.messageType === 'SESS_KEY_NEG_RESP') {
                this.isConnected = true;
                this.emit('connected', this);
            }
            
            this.emit('response', response);
            
            if (response.data) {
                this.emit('data', response.data);
            }
            
        } catch (error) {
            console.error('Error handling device response:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Parsea respuesta simple
     */
    _parseResponse(message) {
        try {
            // Implementación básica de parseo
            if (message.length < 20) {
                return { messageType: 'unknown', data: null };
            }
            
            const prefix = message.slice(0, 4).toString('hex');
            if (prefix !== '000055aa') {
                return { messageType: 'invalid', data: null };
            }
            
            const cmd = message.readUInt32BE(8);
            const dataLength = message.readUInt32BE(12);
            
            let messageType = 'unknown';
            if (cmd === 0x06) messageType = 'SESS_KEY_NEG_RESP';
            else if (cmd === 0x07) messageType = 'CONTROL_NEW';
            else if (cmd === 0x08) messageType = 'SESS_KEY_CMD';
            
            let data = null;
            if (dataLength > 0 && message.length >= 16 + dataLength) {
                const dataBuffer = message.slice(16, 16 + dataLength);
                try {
                    data = JSON.parse(dataBuffer.toString('utf8'));
                } catch (e) {
                    data = dataBuffer.toString('utf8');
                }
            }
            
            return { messageType, data };
        } catch (error) {
            return { messageType: 'error', data: error.message };
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
     */
    sendCommand(command, timeout = 5000) {
        if (!this.isConnected) {
            return this.connect().then(() => this.sendCommand(command, timeout));
        }
        
        const commandStr = typeof command === 'string' ? command : JSON.stringify(command);
        
        return new Promise((resolve, reject) => {
            try {
                const commandId = Date.now().toString();
                
                this.pendingCommands.set(commandId, { resolve, reject });
                
                const timeoutId = setTimeout(() => {
                    if (this.pendingCommands.has(commandId)) {
                        const pendingCommand = this.pendingCommands.get(commandId);
                        this.pendingCommands.delete(commandId);
                        pendingCommand.reject(new Error('Command timeout'));
                    }
                }, timeout);
                
                this.commandTimeouts.set(commandId, timeoutId);
                
                // Construir paquete simplificado
                const packet = this._buildCommandPacket(commandStr);
                
                // SIMPLIFICAR: Envío
                if (this.controller && typeof this.controller.sendUdpPacket === 'function') {
                    const broadcastIp = this.controller.getBroadcastAddress ? 
                        this.controller.getBroadcastAddress(this.ip) : this.ip;
                    
                    this.controller.sendUdpPacket(packet, broadcastIp, this.port)
                        .then(() => {
                            // Resolver inmediatamente para simplificar
                            clearTimeout(timeoutId);
                            this.commandTimeouts.delete(commandId);
                            
                            if (this.pendingCommands.has(commandId)) {
                                const pendingCommand = this.pendingCommands.get(commandId);
                                this.pendingCommands.delete(commandId);
                                pendingCommand.resolve({ success: true });
                            }
                        })
                        .catch(error => {
                            clearTimeout(timeoutId);
                            this.commandTimeouts.delete(commandId);
                            this.pendingCommands.delete(commandId);
                            reject(error);
                        });
                } else {
                    // Fallback
                    clearTimeout(timeoutId);
                    this.commandTimeouts.delete(commandId);
                    this.pendingCommands.delete(commandId);
                    resolve({ success: true });
                }
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Construye paquete de comando
     */
    _buildCommandPacket(payload) {
        const payloadBuffer = Buffer.from(payload, 'utf8');
        const headerSize = 16;
        const packetSize = headerSize + payloadBuffer.length + 8;
        
        const packet = Buffer.alloc(packetSize);
        
        // Prefijo
        packet.write('000055aa', 0, 4, 'hex');
        
        // Secuencia
        packet.writeUInt32BE(++this.lastSequence, 4);
        
        // Comando (0x07 para control)
        packet.writeUInt32BE(0x07, 8);
        
        // Longitud
        packet.writeUInt32BE(payloadBuffer.length, 12);
        
        // Payload
        payloadBuffer.copy(packet, 16);
        
        // CRC
        const crc = this._calculateSimpleCRC(packet.slice(0, 16 + payloadBuffer.length));
        packet.writeUInt32BE(crc, 16 + payloadBuffer.length);
        
        // Sufijo
        packet.write('0000aa55', 16 + payloadBuffer.length + 4, 4, 'hex');
        
        return packet;
    }
    
    /**
     * Establece los colores de los LEDs del dispositivo
     */
    async setColors(colors) {
        if (!Array.isArray(colors)) {
            throw new Error('Colors must be an array');
        }
        
        this.lastColors = colors;
        
        const avgColor = this._calculateAverageColor(colors);
        const tuyaColor = this._convertRgbToTuyaColor(avgColor.r, avgColor.g, avgColor.b);
        
        const command = {
            devId: this.id,
            gwId: this.id,
            uid: '',
            t: Math.floor(Date.now() / 1000),
            dps: {
                '1': true,
                '2': 'colour',
                '5': tuyaColor
            }
        };
        
        return this.sendCommand(command);
    }
    
    /**
     * Calcula el color promedio de un array de colores
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
     */
    _convertRgbToTuyaColor(r, g, b) {
        // Normalizar RGB a [0,1]
        const rf = r / 255;
        const gf = g / 255;
        const bf = b / 255;
        
        // Calcular HSV
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
        
        // Formato Tuya: "h,s,v" -> hex
        const hsvStr = `${h},${s},${v}`;
        const hex = Buffer.from(hsvStr).toString('hex');
        
        return hex;
    }
    
    /**
     * Establece la cantidad de LEDs del dispositivo
     */
    async setLedCount(count) {
        if (!Number.isInteger(count) || count <= 0) {
            throw new Error('LED count must be a positive integer');
        }
        
        this.ledCount = count;
        return Promise.resolve();
    }
}

export default TuyaDevice;
