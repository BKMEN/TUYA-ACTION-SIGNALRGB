/**
 * TuyaDevice.js
 * Representa un dispositivo Tuya individual y maneja su comunicación
 */
const dgram = require('dgram');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class TuyaDevice extends EventEmitter {
    constructor(deviceInfo) {
        super();
        
        this.id = deviceInfo.id || '';
        this.ip = deviceInfo.ip || '';
        this.key = deviceInfo.key || '';
        this.version = deviceInfo.version || '3.3';
        this.name = deviceInfo.name || 'Tuya Device';
        this.productId = deviceInfo.productId || '';
        
        // Estado del dispositivo
        this.connected = false;
        this.online = false;
        this.ledCount = deviceInfo.ledCount || 72;
        this.maxLedCount = 300;
        this.currentColors = [];
        this.brightness = 100;
        
        // Opciones de comunicación
        this.port = deviceInfo.port || 6668;
        this.socketTimeout = 15000;
        this.retryAttempts = 3;
        this.retryDelay = 2000;
        
        // Socket y buffer
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.sequenceNumber = 0;
        
        // Cola de comandos
        this.commandQueue = [];
        this.processingCommands = false;
        this.commandQueueDelay = 50;
    }

    async connect() {
        if (this.connected) return;

        try {
            // Crear socket UDP
            this.socket = dgram.createSocket('udp4');
            
            this.socket.on('error', (error) => {
                this.emit('error', error);
                this._handleDisconnect();
            });
            
            this.socket.on('message', (data) => {
                this._handleData(data);
            });
            
            this.socket.on('close', () => {
                this._handleDisconnect();
            });

            this.connected = true;
            this.emit('connected');
            
            // Enviar handshake
            await this._sendHandshake();
            this.online = true;
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async _sendHandshake() {
        // Implementación del handshake según el protocolo Tuya
        const packet = this._createPacket('handshake', null);
        return this._sendPacket(packet);
    }

    async setColors(colors) {
        if (!this.connected) {
            throw new Error('Device not connected');
        }
        
        const formattedColors = colors.slice(0, this.ledCount).map(color => ({
            r: Math.min(255, Math.max(0, color.r || 0)),
            g: Math.min(255, Math.max(0, color.g || 0)),
            b: Math.min(255, Math.max(0, color.b || 0))
        }));
        
        this.currentColors = formattedColors;
        
        return this._queueCommand({
            type: 'setColors',
            colors: formattedColors
        });
    }

    async setLedCount(count) {
        if (!this.connected) {
            throw new Error('Device not connected');
        }
        
        const ledCount = Math.max(1, Math.min(this.maxLedCount, count));
        this.ledCount = ledCount;
        
        return this._queueCommand({
            type: 'setLedCount',
            count: ledCount
        });
    }

    async getState() {
        if (!this.connected) {
            throw new Error('Device not connected');
        }
        
        return this._queueCommand({
            type: 'getState'
        });
    }

    _createPacket(type, data) {
        // Implementación para crear paquetes según el protocolo Tuya
        // Este es un placeholder - implementar según documentación Tuya
        let packetData;
        
        switch(type) {
            case 'handshake':
                packetData = { gwId: this.id, key: this.key };
                break;
            case 'setColors':
                packetData = { 
                    gwId: this.id, 
                    key: this.key,
                    colors: data.colors,
                    ledCount: this.ledCount
                };
                break;
            case 'setLedCount':
                packetData = {
                    gwId: this.id,
                    key: this.key,
                    ledCount: data.count
                };
                break;
            case 'getState':
                packetData = { gwId: this.id, key: this.key };
                break;
        }
        
        // Aquí iría la lógica real de formateo de paquetes
        return Buffer.from(JSON.stringify(packetData));
    }

    async _sendPacket(packet) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                return reject(new Error('Socket not connected'));
            }

            this.socket.send(
                packet, 0, packet.length,
                this.port, this.ip, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(true);
                    }
                }
            );
        });
    }

    _handleData(data) {
        // Procesar respuesta del dispositivo
        try {
            // Aquí iría la lógica para parsear la respuesta
            const parsedData = this._parseResponse(data);
            
            this.emit('data', parsedData);
            
            // Actualizar estado si es necesario
            if (parsedData && parsedData.dps) {
                if (parsedData.dps.ledCount) {
                    this.ledCount = parsedData.dps.ledCount;
                }
                if (parsedData.dps.online !== undefined) {
                    this.online = parsedData.dps.online;
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    _parseResponse(data) {
        // Placeholder para parsear respuesta
        // Implementar según documentación Tuya
        return { dps: {} };
    }

    _handleDisconnect() {
        this.connected = false;
        this.online = false;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.buffer = Buffer.alloc(0);
        this.emit('disconnected');
    }

    disconnect() {
        this._handleDisconnect();
    }

    _queueCommand(command) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Command timed out: ${command.type}`));
            }, this.socketTimeout);

            this.commandQueue.push({
                command,
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            if (!this.processingCommands) {
                this._processCommandQueue();
            }
        });
    }

    async _processCommandQueue() {
        if (this.commandQueue.length === 0) {
            this.processingCommands = false;
            return;
        }
        
        this.processingCommands = true;
        const item = this.commandQueue.shift();
        
        try {
            let result;
            switch (item.command.type) {
                case 'setColors':
                    const colorPacket = this._createPacket('setColors', { colors: item.command.colors });
                    result = await this._sendPacket(colorPacket);
                    break;
                case 'setLedCount':
                    const ledPacket = this._createPacket('setLedCount', { count: item.command.count });
                    result = await this._sendPacket(ledPacket);
                    break;
                case 'getState':
                    const statePacket = this._createPacket('getState', null);
                    result = await this._sendPacket(statePacket);
                    break;
                default:
                    throw new Error(`Unknown command type: ${item.command.type}`);
            }
            
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        } finally {
            setTimeout(() => this._processCommandQueue(), this.commandQueueDelay);
        }
    }

    toJSON() {
        return {
            id: this.id,
            ip: this.ip,
            name: this.name,
            productId: this.productId,
            connected: this.connected,
            online: this.online,
            ledCount: this.ledCount,
            maxLedCount: this.maxLedCount,
            port: this.port
        };
    }

    rgbToHsv([r, g, b]) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        
        let h;
        if (d === 0) h = 0;
        else if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        
        const s = max === 0 ? 0 : d / max;
        const v = max;
        
        return [h, s, v];
    }
}

module.exports = TuyaDevice;