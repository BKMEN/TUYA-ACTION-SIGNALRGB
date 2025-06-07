/**
 * TuyaUDP.js
 * Proporciona utilidades básicas para el envío de paquetes UDP.
 * Usa el módulo UDP de SignalRGB si está disponible y cae a dgram
 * en entornos de desarrollo.
 */

let dgram;
try {
    ({ default: dgram } = await import('@SignalRGB/udp'));
} catch (err) {
    dgram = await import('node:dgram');
}

class TuyaUDP {
    constructor() {
        this.socket = dgram.createSocket('udp4');
    }

    /**
     * Envía un mensaje UDP.
     * @param {Buffer|string} msg - Datos a enviar
     * @param {number} port - Puerto destino
     * @param {string} host - Host destino
     * @returns {Promise<void>}
     */
    send(msg, port, host) {
        return new Promise((resolve, reject) => {
            const buffer = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
            this.socket.send(buffer, port, host, err => {
                if (err) reject(err); else resolve();
            });
        });
    }

    /**
     * Cierra el socket UDP.
     */
    close() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (err) {
                // TODO: manejar errores específicos de cierre
            }
            this.socket = null;
        }
    }
}

export default TuyaUDP;

