/**
 * EventEmitter simplificado para SignalRGB
 * Compatible con el patrón básico de Node.js EventEmitter
 */
class EventEmitter {
    constructor() {
        this.events = {};
        this.maxListeners = 10;
    }

    /**
     * Agrega un listener para un evento
     * @param {string} event - Nombre del evento
     * @param {Function} listener - Función listener
     * @returns {EventEmitter} - Esta instancia para chaining
     */
    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        if (this.events[event].length >= this.maxListeners) {
            console.warn(`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ${this.events[event].length + 1} listeners added for event "${event}".`);
        }
        
        this.events[event].push(listener);
        return this;
    }

    /**
     * Agrega un listener que se ejecuta solo una vez
     * @param {string} event - Nombre del evento
     * @param {Function} listener - Función listener
     * @returns {EventEmitter} - Esta instancia para chaining
     */
    once(event, listener) {
        const onceWrapper = (...args) => {
            this.removeListener(event, onceWrapper);
            listener.apply(this, args);
        };
        
        this.on(event, onceWrapper);
        return this;
    }

    /**
     * Emite un evento con argumentos
     * @param {string} event - Nombre del evento
     * @param {...any} args - Argumentos para los listeners
     * @returns {boolean} - true si había listeners
     */
    emit(event, ...args) {
        if (!this.events[event] || this.events[event].length === 0) {
            return false;
        }

        // Crear copia para evitar problemas si se modifica durante la emisión
        const listeners = [...this.events[event]];
        
        for (const listener of listeners) {
            try {
                listener.apply(this, args);
            } catch (error) {
                // Emitir error si hay listeners para 'error', sino log
                if (event !== 'error' && this.events.error && this.events.error.length > 0) {
                    this.emit('error', error);
                } else if (event === 'error') {
                    console.error('Uncaught EventEmitter error:', error);
                } else {
                    console.error(`Error in event listener for "${event}":`, error);
                }
            }
        }
        
        return true;
    }

    /**
     * Remueve un listener específico
     * @param {string} event - Nombre del evento
     * @param {Function} listener - Función listener a remover
     * @returns {EventEmitter} - Esta instancia para chaining
     */
    removeListener(event, listener) {
        if (!this.events[event]) {
            return this;
        }
        
        const index = this.events[event].indexOf(listener);
        if (index !== -1) {
            this.events[event].splice(index, 1);
        }
        
        return this;
    }

    /**
     * Alias para removeListener
     */
    off(event, listener) {
        return this.removeListener(event, listener);
    }

    /**
     * Remueve todos los listeners de un evento o todos los eventos
     * @param {string} [event] - Evento específico, o undefined para todos
     * @returns {EventEmitter} - Esta instancia para chaining
     */
    removeAllListeners(event) {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
        return this;
    }

    /**
     * Obtiene los listeners de un evento
     * @param {string} event - Nombre del evento
     * @returns {Function[]} - Array de listeners
     */
    listeners(event) {
        return this.events[event] ? [...this.events[event]] : [];
    }

    /**
     * Obtiene la cantidad de listeners de un evento
     * @param {string} event - Nombre del evento
     * @returns {number} - Cantidad de listeners
     */
    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    }

    /**
     * Obtiene todos los nombres de eventos con listeners
     * @returns {string[]} - Array de nombres de eventos
     */
    eventNames() {
        return Object.keys(this.events);
    }

    /**
     * Establece el número máximo de listeners por evento
     * @param {number} n - Número máximo
     * @returns {EventEmitter} - Esta instancia para chaining
     */
    setMaxListeners(n) {
        this.maxListeners = n;
        return this;
    }

    /**
     * Obtiene el número máximo de listeners
     * @returns {number} - Número máximo de listeners
     */
    getMaxListeners() {
        return this.maxListeners;
    }
}

export default EventEmitter;
