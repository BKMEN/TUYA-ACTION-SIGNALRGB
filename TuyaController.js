/**
 * Controlador de dispositivo Tuya - Maneja la lógica de UI y comunicación
 * Basado en TuyaController.test.js del plugin FU-RAZ
 */

import TuyaDeviceModel from './models/TuyaDeviceModel.js';
import TuyaSessionNegotiator from './negotiators/TuyaSessionNegotiator.js';
import TuyaCommandEncryptor from './crypto/TuyaCommandEncryptor.js';

class TuyaController {
    constructor(device) {
        this.device = device instanceof TuyaDeviceModel ? device : new TuyaDeviceModel(device);
        this.negotiator = null;
        this.encryptor = null;
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
            // Construir comando usando TuyaPacket
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
        // Usar TuyaPacket existente para construir el payload
        // Esta función debería integrar con tu utils/TuyaPacket.js
        const payload = {
            "1": true,  // Encender
            "5": "colour",  // Modo color
            "24": rgbArray.map(rgb => ({
                r: rgb.r,
                g: rgb.g,
                b: rgb.b
            }))
        };
        
        return JSON.stringify(payload);
    }

    sendCommand(encryptedData) {
        try {
            const socket = udp.createSocket();
            socket.send(encryptedData, this.device.port, this.device.ip);
            socket.close();
        } catch (error) {
            service.log('Error sending command: ' + error.message);
            throw error;
        }
    }
}

export default TuyaController;