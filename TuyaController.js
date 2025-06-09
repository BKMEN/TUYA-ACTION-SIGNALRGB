/**
 * Controlador de dispositivo Tuya - Maneja la lógica de UI y comunicación
 * Basado en TuyaController.test.js del plugin FU-RAZ
 */

import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import TuyaSessionNegotiator from './negotiators/TuyaSessionNegotiator.js';
import TuyaCommandEncryptor from './Crypto/TuyaCommandEncryptor.js';
import DeviceList from './DeviceList.js';

let udp;
try {
    ({ default: udp } = await import('@SignalRGB/udp'));
} catch (err) {
    udp = await import('node:dgram');
}

class TuyaController {
    // Mapa global de negociaciones activas por dispositivo
    static activeNegotiations = new Map();
    constructor(device) {
        this.devices = [];
        this.device = null;

        if (device) {
            this.addDevice(device);
        } else {
            if (typeof service !== 'undefined' && service.log) {
                service.log('TuyaController constructor received undefined device, using empty model');
            }
        }

        this.negotiator = null;
        this.encryptor = null;
        this.socket = null; // Socket persistente para comandos
        this.online = true;
        this.pendingNegotiation = false;
        this._negotiationPromise = null;
    }

    addDevice(deviceConfig) {
        const model = deviceConfig instanceof TuyaDeviceModel ? deviceConfig : new TuyaDeviceModel(deviceConfig || {});

        this.devices.push(model);

        // mantener compatibilidad con código que usa this.device
        if (!this.device) {
            this.device = model;
        }

        if (model.enabled && model.localKey) {
            this.device = model;
            try {
                this.startNegotiation();
            } catch (_) {}
        }

        return model;
    }

    connectToDevice(deviceId) {
        const model = this.devices.find(d => d.id === deviceId);
        if (!model) {
            throw new Error('Device not found: ' + deviceId);
        }

        this.device = model;

        if (model.enabled && model.localKey) {
            try {
                this.startNegotiation();
            } catch (_) {}
        } else {
            throw new Error('Device missing local key or disabled');
        }
    }

    // Método llamado desde QML para actualizar configuración
    updateDeviceConfig(newLocalKey, newEnabledState, newDeviceType) {
        try {
            // Actualizar propiedades del dispositivo
            this.device.localKey = newLocalKey || this.device.localKey;
            this.device.enabled = newEnabledState !== undefined ? newEnabledState : this.device.enabled;
            this.device.deviceType = newDeviceType || this.device.deviceType;
            
            // Guardar configuración
            const saved = this.device.saveSettings();
            service.log(`Estado actualizado: enabled=${this.device.enabled}, localKey=${this.device.localKey}`);
            
            if (saved) {
                service.log('Device configuration updated: ' + this.device.id);
                
                // Emitir evento para QML
                if (typeof service.deviceConfigured === 'function') {
                    service.deviceConfigured(this.device.id);
                }
                
                // Si está habilitado y tiene localKey, iniciar negociación
                if (this.device.enabled && this.device.localKey) {
                    try {
                        this.startNegotiation();
                    } catch (_) {}
                }
                
                return true;
            } else {
                throw new Error('Failed to save device settings');
            }
            
        } catch (error) {
            service.log('Error updating device config: ' + error.message);
            
            // Emitir error para QML
            if (typeof service.deviceError === 'function') {
                service.deviceError(this.device.id, error.message);
            }
            
            throw error;
        }
    }

    startNegotiation() {
        if (!this.device.localKey || !this.device.enabled) {
            service.log('Cannot start negotiation: missing localKey or device disabled');
            this.pendingNegotiation = true;
            return;
        }

        if (this.device.isReady()) {
            service.log('Device already has an active session: ' + this.device.id);
            return;
        }

        if (TuyaController.activeNegotiations.has(this.device.id)) {
            service.log('Global negotiation already running for device: ' + this.device.id);
            return TuyaController.activeNegotiations.get(this.device.id);
        }

        if (this.negotiator && this.negotiator.isNegotiating) {
            service.log('Negotiation already running for device: ' + this.device.id);
            return this._negotiationPromise;
        }

        try {
            service.log('Starting negotiation for device: ' + this.device.id);
            this.pendingNegotiation = false;

            if (this.negotiator) {
                this.negotiator.cleanup();
                this.negotiator = null;
            }

            this.negotiator = new TuyaSessionNegotiator({
                deviceId: this.device.id,
                deviceKey: this.device.localKey,
                ip: this.device.ip,
                port: this.device.port
            });
            
            this.negotiator.on('success', (sessionKey) => {
                this.device.setSessionKey(sessionKey);
                this.encryptor = new TuyaCommandEncryptor(sessionKey);

                this._negotiationPromise = null;
                TuyaController.activeNegotiations.delete(this.device.id);

                service.log('Negotiation successful for device: ' + this.device.id);
                
                // Emitir evento para QML
                if (typeof service.negotiationComplete === 'function') {
                    service.negotiationComplete(this.device.id);
                }
            });
            
            this.negotiator.on('error', (error) => {
                service.log('Negotiation failed for device ' + this.device.id + ': ' + error.message);

                this._negotiationPromise = null;
                TuyaController.activeNegotiations.delete(this.device.id);
                
                // Emitir error para QML
                if (typeof service.deviceError === 'function') {
                    service.deviceError(this.device.id, 'Negotiation failed: ' + error.message);
                }
            });
            
            // Iniciar proceso de negociación de sesión
            if (typeof this.negotiator.negotiateSession === 'function') {
                this._negotiationPromise = this.negotiator.negotiateSession();
                this._negotiationPromise.catch(() => {});
            } else if (typeof this.negotiator.start === 'function') {
                // Compatibilidad por si existe un método start en otras versiones
                this._negotiationPromise = Promise.resolve(this.negotiator.start());
                this._negotiationPromise.catch(() => {});
            } else {
                throw new Error('Negotiator instance has no start method');
            }

            if (this._negotiationPromise) {
                TuyaController.activeNegotiations.set(this.device.id, this._negotiationPromise);
                this._negotiationPromise.finally(() => {
                    TuyaController.activeNegotiations.delete(this.device.id);
                });
            }
            
        } catch (error) {
            service.log('Error starting negotiation: ' + error.message);
            
            if (typeof service.deviceError === 'function') {
                service.deviceError(this.device.id, error.message);
            }
        }
    }

    setColor(rgbArray) {
        if (!this.device.isReady()) {
            throw new Error('Device not ready for commands');
        }

        try {
            // Construir comando usando buildColorPayload mejorado
            const colorPayload = this.buildColorPayload(rgbArray);
            
            // Cifrar comando
            const encryptedCommand = this.encryptor.encryptCommand(
                colorPayload, 
                this.device.getNextSequenceNumber()
            );
            
            // Enviar por UDP
            this.sendCommand(encryptedCommand);
            
            service.log('Color command sent to device: ' + this.device.id);
            
        } catch (error) {
            service.log('Error setting color: ' + error.message);
            throw error;
        }
    }

    buildColorPayload(rgbArray) {
        try {
            // Implementación completa del formato de color Tuya
            if (!rgbArray || rgbArray.length === 0) {
                throw new Error('Invalid RGB array');
            }

            const rgb = rgbArray[0]; // Usar primer color
            
            // Obtener configuración DPS para el tipo de dispositivo
            const deviceConfig = DeviceList.getDeviceTypeConfig(this.device.deviceType);
            
            // Convertir RGB a HSV para formato Tuya
            const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
            
            // Crear string de color en formato hexadecimal HSV (12 dígitos)
            const h = Math.round(hsv.h * 360).toString(16).padStart(4, '0');
            const s = Math.round(hsv.s * 1000).toString(16).padStart(4, '0');
            const v = Math.round(hsv.v * 1000).toString(16).padStart(4, '0');
            
            const colorString = h + s + v;
            
            // Construir payload DPS usando configuración del dispositivo
            const dpsPayload = {};
            dpsPayload[deviceConfig.dps.power] = true;
            dpsPayload[deviceConfig.dps.mode] = "colour";
            dpsPayload[deviceConfig.dps.color] = colorString;
            dpsPayload[deviceConfig.dps.brightness] = Math.round(hsv.v * 255);
            
            const payload = {
                "dps": dpsPayload,
                "t": Math.floor(Date.now() / 1000)
            };
            
            return JSON.stringify(payload);

        } catch (error) {
            service.log('Error building color payload: ' + error.message);
            throw error;
        }
    }

    buildPowerPayload(state) {
        try {
            const deviceConfig = DeviceList.getDeviceTypeConfig(this.device.deviceType);
            const dpsPayload = {};
            dpsPayload[deviceConfig.dps.power] = !!state;
            const payload = {
                dps: dpsPayload,
                t: Math.floor(Date.now() / 1000)
            };
            return JSON.stringify(payload);
        } catch (error) {
            service.log('Error building power payload: ' + error.message);
            throw error;
        }
    }

    setPower(on) {
        if (!this.device.isReady()) {
            throw new Error('Device not ready for commands');
        }

        try {
            const payload = this.buildPowerPayload(on);
            const encryptedCommand = this.encryptor.encryptCommand(
                payload,
                this.device.getNextSequenceNumber()
            );
            this.sendCommand(encryptedCommand);
            service.log(`Power ${on ? 'on' : 'off'} command sent to device: ` + this.device.id);
        } catch (error) {
            service.log('Error setting power: ' + error.message);
            throw error;
        }
    }

    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        
        let h = 0;
        let s = max === 0 ? 0 : diff / max;
        let v = max;
        
        if (diff !== 0) {
            switch (max) {
                case r: h = (g - b) / diff + (g < b ? 6 : 0); break;
                case g: h = (b - r) / diff + 2; break;
                case b: h = (r - g) / diff + 4; break;
            }
            h /= 6;
        }
        
        return { h, s, v };
    }

    sendCommand(encryptedData) {
        try {
            // Crear socket persistente si no existe
            if (!this.socket) {
                this.socket = udp.createSocket('udp4');
                
                this.socket.on('error', (error) => {
                    service.log('Command socket error: ' + error.message);
                    this.socket = null;
                });
            }
            
            this.socket.send(encryptedData, this.device.port, this.device.ip, (error) => {
                if (error) {
                    service.log('Error sending command to ' + this.device.id + ': ' + error.message);
                    throw error;
                }
            });
            
        } catch (error) {
            service.log('Error in sendCommand: ' + error.message);
            throw error;
        }
    }

    setOffline() {
        this.online = false;
        if (this.negotiator) {
            this.negotiator.cleanup();
        }
    }

    cleanup() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        if (this.negotiator) {
            this.negotiator.cleanup();
            this.negotiator = null;
        }
    }
}

export default TuyaController;

