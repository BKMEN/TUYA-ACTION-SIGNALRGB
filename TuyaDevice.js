/**
 * TuyaDevice.js
 * Representa un dispositivo Tuya individual y maneja su comunicación
 */

class TuyaDevice {
    /**
     * Constructor para un dispositivo Tuya
     * @param {Object} deviceInfo - Información básica del dispositivo (id, ip, key, etc.)
     */
    constructor(deviceInfo) {
        this.id = deviceInfo.id || '';
        this.ip = deviceInfo.ip || '';
        this.key = deviceInfo.key || '';
        this.version = deviceInfo.version || '3.3';
        this.name = deviceInfo.name || 'Tuya Device';
        this.productId = deviceInfo.productId || '';
        
        // Estado del dispositivo
        this.connected = false;
        this.online = false;
        this.ledCount = 0;
        this.maxLedCount = 300; // Valor predeterminado, se actualizará según el dispositivo
        this.currentColors = [];
        
        // Opciones de configuración
        this.port = deviceInfo.port || 6668;
        this.socketTimeout = 15000; // 15 segundos de timeout para operaciones de socket
        
        // Socket y buffer para comunicación
        this.socket = null;
        this.buffer = null;
        this.sequenceNumber = 0;
        
        // Cola de comandos para evitar sobrecarga de la red
        this.commandQueue = [];
        this.processingCommands = false;
    }
    
    /**
     * Conectar al dispositivo
     * @returns {Promise} Promesa que se resuelve cuando la conexión es exitosa
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Si ya hay una conexión, cerrarla primero
                if (this.socket) {
                    this.disconnect();
                }
                
                // Crear un nuevo socket TCP
                this.socket = new Socket();
                
                // Configurar manejadores de eventos
                this.socket.onError = (error) => {
                    console.error(`[${this.id}] Socket error:`, error);
                    this.connected = false;
                    this.online = false;
                    reject(error);
                };
                
                this.socket.onClose = () => {
                    console.log(`[${this.id}] Connection closed`);
                    this.connected = false;
                    this.online = false;
                };
                
                this.socket.onData = (data) => {
                    this._handleData(data);
                };
                
                // Conectar al dispositivo
                this.socket.connect(this.ip, this.port, this.socketTimeout);
                this.connected = true;
                
                // Enviar comando de handshake para verificar la conexión
                this._sendHandshake()
                    .then(() => {
                        this.online = true;
                        console.log(`[${this.id}] Successfully connected to device at ${this.ip}`);
                        resolve();
                    })
                    .catch((error) => {
                        console.error(`[${this.id}] Handshake failed:`, error);
                        this.disconnect();
                        reject(error);
                    });
                
            } catch (error) {
                console.error(`[${this.id}] Failed to connect:`, error);
                this.connected = false;
                this.online = false;
                reject(error);
            }
        });
    }
    
    /**
     * Desconectar del dispositivo
     */
    disconnect() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (error) {
                console.error(`[${this.id}] Error closing socket:`, error);
            }
            this.socket = null;
        }
        this.connected = false;
        this.online = false;
    }
    
    /**
     * Envía un comando de handshake al dispositivo
     * @private
     * @returns {Promise} Promesa que se resuelve cuando el handshake es exitoso
     */
    async _sendHandshake() {
        // Implementación del handshake según el protocolo Tuya
        // Esto variará según la versión del protocolo
        return new Promise((resolve, reject) => {
            // Lógica de handshake a implementar
            resolve();
        });
    }
    
    /**
     * Maneja los datos recibidos del dispositivo
     * @private
     * @param {Buffer} data - Datos recibidos del socket
     */
    _handleData(data) {
        // Procesar datos recibidos según el protocolo Tuya
        // Parsear respuesta y actualizar estado del dispositivo
    }
    
    /**
     * Actualiza los colores del dispositivo
     * @param {Array} colors - Array de objetos color en formato RGB
     * @returns {Promise} Promesa que se resuelve cuando se aplican los colores
     */
    async setColors(colors) {
        if (!this.connected || !this.online) {
            throw new Error('Device is not connected');
        }
        
        // Verificar y formatea el array de colores
        if (!Array.isArray(colors)) {
            throw new Error('Colors must be an array');
        }
        
        const formattedColors = colors.slice(0, this.maxLedCount).map(color => {
            return {
                r: Math.max(0, Math.min(255, color.r || 0)),
                g: Math.max(0, Math.min(255, color.g || 0)),
                b: Math.max(0, Math.min(255, color.b || 0))
            };
        });
        
        this.currentColors = formattedColors;
        
        // Añadir comando a la cola
        return this._queueCommand({
            type: 'setColors',
            colors: formattedColors
        });
    }
    
    /**
     * Establece el número de LEDs del dispositivo
     * @param {Number} count - Número de LEDs
     * @returns {Promise} Promesa que se resuelve cuando se actualiza el número de LEDs
     */
    async setLedCount(count) {
        if (!this.connected || !this.online) {
            throw new Error('Device is not connected');
        }
        
        const ledCount = Math.max(1, Math.min(this.maxLedCount, count));
        this.ledCount = ledCount;
        
        // Añadir comando a la cola
        return this._queueCommand({
            type: 'setLedCount',
            count: ledCount
        });
    }
    
    /**
     * Obtiene el estado actual del dispositivo
     * @returns {Promise} Promesa que se resuelve con el estado del dispositivo
     */
    async getState() {
        if (!this.connected || !this.online) {
            throw new Error('Device is not connected');
        }
        
        // Añadir comando a la cola
        return this._queueCommand({
            type: 'getState'
        });
    }
    
    /**
     * Añade un comando a la cola y procesa la cola si no está en proceso
     * @private
     * @param {Object} command - Comando a encolar
     * @returns {Promise} Promesa que se resuelve cuando se procesa el comando
     */
    _queueCommand(command) {
        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                command,
                resolve,
                reject
            });
            
            // Si no está procesando comandos, iniciar el proceso
            if (!this.processingCommands) {
                this._processCommandQueue();
            }
        });
    }
    
    /**
     * Procesa la cola de comandos
     * @private
     */
    async _processCommandQueue() {
        if (this.commandQueue.length === 0) {
            this.processingCommands = false;
            return;
        }
        
        this.processingCommands = true;
        const item = this.commandQueue.shift();
        
        try {
            // Procesar el comando según su tipo
            let result;
            switch (item.command.type) {
                case 'setColors':
                    result = await this._sendColorCommand(item.command.colors);
                    break;
                case 'setLedCount':
                    result = await this._sendLedCountCommand(item.command.count);
                    break;
                case 'getState':
                    result = await this._sendStateCommand();
                    break;
                default:
                    throw new Error(`Unknown command type: ${item.command.type}`);
            }
            
            item.resolve(result);
        } catch (error) {
            console.error(`[${this.id}] Command error:`, error);
            item.reject(error);
        }
        
        // Procesar el siguiente comando
        setTimeout(() => this._processCommandQueue(), 50); // Pequeño retraso para no saturar
    }
    
    /**
     * Envía un comando para cambiar los colores
     * @private
     * @param {Array} colors - Array de colores RGB
     * @returns {Promise} Promesa que se resuelve cuando se envía el comando
     */
    async _sendColorCommand(colors) {
        // Implementación para enviar comando de cambio de colores según protocolo Tuya
        return new Promise((resolve, reject) => {
            // Lógica específica para enviar el comando de colores
            resolve();
        });
    }
    
    /**
     * Envía un comando para cambiar el número de LEDs
     * @private
     * @param {Number} count - Número de LEDs
     * @returns {Promise} Promesa que se resuelve cuando se envía el comando
     */
    async _sendLedCountCommand(count) {
        // Implementación para enviar comando de cambio de número de LEDs según protocolo Tuya
        return new Promise((resolve, reject) => {
            // Lógica específica para enviar el comando de LEDs
            resolve();
        });
    }
    
    /**
     * Envía un comando para obtener el estado del dispositivo
     * @private
     * @returns {Promise} Promesa que se resuelve con el estado del dispositivo
     */
    async _sendStateCommand() {
        // Implementación para enviar comando de obtención de estado según protocolo Tuya
        return new Promise((resolve, reject) => {
            // Lógica específica para enviar el comando de estado
            resolve({
                online: this.online,
                ledCount: this.ledCount,
                maxLedCount: this.maxLedCount
            });
        });
    }
    
    /**
     * Retorna un objeto con la información del dispositivo para serialización
     * @returns {Object} Información del dispositivo
     */
    toJSON() {
        return {
            id: this.id,
            ip: this.ip,
            name: this.name,
            productId: this.productId,
            connected: this.connected,
            online: this.online,
            ledCount: this.ledCount,
            maxLedCount: this.maxLedCount
        };
    }
}

module.exports = TuyaDevice;