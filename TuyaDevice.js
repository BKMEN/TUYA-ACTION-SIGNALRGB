const TuyaPacket = require('./utils/TuyaPacket');
const BaseClass = require('./Libs/BaseClass.test');
const { AES } = require('./Crypto/AES.test');
const { Base64 } = require('./Crypto/Base64.test');
const { Hex } = require('./Crypto/Hex.test');

class TuyaDevice extends BaseClass {
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
        
        // Bind de métodos
        this._handleData = this._handleData.bind(this);
        this._processCommandQueue = this._processCommandQueue.bind(this);
    }

    async connect() {
        if (this.connected) {
            return;
        }

        try {
            this.socket = new Socket();
            
            this.socket.onConnect = () => {
                this.connected = true;
                this.trigger('connected');
                this._sendHandshake();
            };
            
            this.socket.onData = this._handleData;
            
            this.socket.onError = (error) => {
                this.trigger('error', error);
                this._handleDisconnect();
            };
            
            this.socket.onClose = () => {
                this._handleDisconnect();
            };

            await this.socket.connect(this.ip, this.port);
        } catch (error) {
            this.trigger('error', error);
            throw error;
        }
    }

    async _sendHandshake() {
        const packet = TuyaPacket.create({
            command: TuyaPacket.COMMANDS.HEART_BEAT,
            data: {
                gwId: this.id,
                devId: this.id
            }
        });

        try {
            await this._sendPacket(packet);
            this.online = true;
            this.trigger('ready');
        } catch (error) {
            this.trigger('error', error);
            this._handleDisconnect();
        }
    }

    async setColors(colors) {
        if (!this.connected || !this.online) {
            throw new Error('Device not connected');
        }

        const formattedColors = colors.slice(0, this.ledCount).map(color => ({
            r: Math.min(255, Math.max(0, color.r || 0)),
            g: Math.min(255, Math.max(0, color.g || 0)),
            b: Math.min(255, Math.max(0, color.b || 0))
        }));

        // Convertir colores al formato Tuya
        const colorData = this._formatColorsForTuya(formattedColors);

        const command = {
            devId: this.id,
            dps: {
                '1': true, // Encendido
                '2': 'colour',
                '3': this.brightness,
                '5': colorData
            }
        };

        await this._queueCommand({
            type: 'setColors',
            data: command
        });

        this.currentColors = formattedColors;
    }

    _formatColorsForTuya(colors) {
        // Calcular color promedio para dispositivos que solo soportan un color
        const avgColor = colors.reduce((acc, color) => ({
            r: acc.r + color.r / colors.length,
            g: acc.g + color.g / colors.length,
            b: acc.b + color.b / colors.length
        }), { r: 0, g: 0, b: 0 });

        // Convertir a formato hexadecimal Tuya
        const r = Math.round(avgColor.r).toString(16).padStart(2, '0');
        const g = Math.round(avgColor.g).toString(16).padStart(2, '0');
        const b = Math.round(avgColor.b).toString(16).padStart(2, '0');

        // Convertir a HSV para el formato Tuya
        const [h, s, v] = this.rgbToHsv([avgColor.r, avgColor.g, avgColor.b]);
        const hue = Math.round(h).toString(16).padStart(4, '0');
        const sat = Math.round(s * 1000).toString(16).padStart(4, '0');

        return `${r}${g}${b}${hue}${sat}`;
    }

    async _sendPacket(packet) {
        if (!this.socket) {
            throw new Error('Socket not connected');
        }

        const encryptedData = this._encryptPayload(packet.data);
        packet.data = encryptedData;

        return new Promise((resolve, reject) => {
            try {
                this.socket.write(packet.buffer);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    _encryptPayload(data) {
        if (!data) return null;

        const key = Hex.parse(this.key);
        const iv = Hex.parse('0000000000000000');
        
        let payload;
        if (typeof data === 'object') {
            payload = JSON.stringify(data);
        } else {
            payload = data.toString();
        }

        const encrypted = AES.encrypt(payload, key, { iv });
        return Base64.parse(encrypted.toString());
    }

    _handleData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= 16) {
            const packet = TuyaPacket.parse(this.buffer);
            if (!packet) break;

            this._processPacket(packet);
            this.buffer = this.buffer.slice(packet.buffer.length);
        }
    }

    _processPacket(packet) {
        if (!packet.valid) {
            this.trigger('error', new Error('Invalid packet received'));
            return;
        }

        switch (packet.commandName) {
            case 'HEART_BEAT':
                this.trigger('heartbeat');
                break;

            case 'STATUS':
                this._handleStatusUpdate(packet.data);
                break;

            case 'CONTROL':
                this._handleControlResponse(packet.data);
                break;

            default:
                this.trigger('unknown-command', packet);
        }
    }

    _handleStatusUpdate(data) {
        try {
            const status = JSON.parse(data.toString());
            this.trigger('status-update', status);
        } catch (error) {
            this.trigger('error', error);
        }
    }

    _handleDisconnect() {
        this.connected = false;
        this.online = false;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.trigger('disconnected');
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this._handleDisconnect();
        }
    }
}

module.exports = TuyaDevice;