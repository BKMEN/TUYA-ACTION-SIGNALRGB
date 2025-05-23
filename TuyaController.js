/**
 * Controlador de dispositivo Tuya - Maneja la lógica de UI y comunicación
 * Basado en TuyaController.test.js del plugin FU-RAZ
 */

import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import TuyaSessionNegotiator from './negotiators/TuyaSessionNegotiator.js';
import TuyaCommandEncryptor from './crypto/TuyaCommandEncryptor.js';
import DeviceList from './DeviceList.js';
import udp from "@SignalRGB/udp";

class TuyaController {
    constructor(device) {
        this.device = device instanceof TuyaDeviceModel ? device : new TuyaDeviceModel(device);
        this.negotiator = null;
        this.encryptor = null;
        this.socket = null; // Socket persistente para comandos
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
            
            if (saved) {
                service.log('Device configuration updated: ' + this.device.id);
                
                // Emitir evento para QML
                if (typeof service.deviceConfigured === 'function') {
                    service.deviceConfigured(this.device.id);
                }
                
                // Si está habilitado y tiene localKey, iniciar negociación
                if (this.device.enabled && this.device.localKey) {
                    this.startNegotiation();
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
            return;
        }

        try {
            service.log('Starting negotiation for device: ' + this.device.id);
            
            this.negotiator = new TuyaSessionNegotiator(this.device);
            
            this.negotiator.on('success', (sessionKey) => {
                this.device.setSessionKey(sessionKey);
                this.encryptor = new TuyaCommandEncryptor(sessionKey);
                
                service.log('Negotiation successful for device: ' + this.device.id);
                
                // Emitir evento para QML
                if (typeof service.negotiationComplete === 'function') {
                    service.negotiationComplete(this.device.id);
                }
            });
            
            this.negotiator.on('error', (error) => {
                service.log('Negotiation failed for device ' + this.device.id + ': ' + error.message);
                
                // Emitir error para QML
                if (typeof service.deviceError === 'function') {
                    service.deviceError(this.device.id, 'Negotiation failed: ' + error.message);
                }
            });
            
            this.negotiator.start();
            
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