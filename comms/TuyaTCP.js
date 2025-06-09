/**
 * TuyaTCP.js
 * Abstracción sencilla para conexiones TCP con dispositivos Tuya.
 * Permite establecer la conexión, enviar datos y cerrar el socket.
 */

import net from 'node:net';

class TuyaTCP {
    constructor(host, port = 6668) {
        this.host = host;
        this.port = port;
        this.socket = null;
        this._handleData = null;
    }

    setDataHandler(fn) {
        if (typeof fn === 'function') {
            this._handleData = fn;
        }
    }

    /**
     * Abre una conexión TCP con el dispositivo.
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection(this.port, this.host, () => {
                this.socket.on('data', data => {
                    console.log('📨 TCP DATA RECEIVED:', data.toString('hex'));
                    if (typeof this._handleData === 'function') {
                        this._handleData(data);
                    }
                });
                resolve();
            });
            this.socket.once('error', err => {
                reject(err);
            });
        });
    }

    /**
     * Envía datos por la conexión abierta.
     * @param {Buffer|string} data - Datos a enviar
     * @returns {Promise<void>}
     */
    send(data) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                return reject(new Error('Socket not connected'));
            }
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            this.socket.write(buffer, err => {
                if (err) reject(err); else resolve();
            });
        });
    }

    /**
     * Cierra la conexión TCP.
     */
    close() {
        if (this.socket) {
            try {
                this.socket.end();
            } catch (err) {
                // TODO: manejar errores de cierre
            }
            this.socket = null;
        }
    }
}

export default TuyaTCP;

