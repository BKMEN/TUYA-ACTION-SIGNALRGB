# TUYA-ACTION-SIGNALRGB

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🌈 Controla tus dispositivos Tuya desde SignalRGB

**TUYA-ACTION-SIGNALRGB** es un plugin para [SignalRGB](https://www.signalrgb.com/) que permite descubrir, controlar y sincronizar dispositivos LED WiFi basados en Tuya desde el ecosistema SignalRGB. Compatible con tiras LED, bombillas, paneles y más.

---

## ⚡️ Características

- **Descubrimiento automático** de dispositivos Tuya en red local.
- Control de **color RGB**, brillo y cantidad de LEDs.
- Interfaz de usuario visual en QML (ajusta color, número de LEDs, estado en vivo).
- Soporte tanto para **protocolo Tuya 3.3 como 3.4+** (cifrado GCM).
- Manejo de errores y logs detallados para depuración.
- Pensado para fácil integración y futuras mejoras.

---

## 📦 Estructura del proyecto

- `index.js` - Archivo principal del plugin para SignalRGB
- `TuyaController.js` - Controlador central para gestionar dispositivos
- `TuyaDevice.js` - Clase que representa un dispositivo Tuya
- `crypto.js` - Funciones para cifrado y comunicación con dispositivos Tuya
- `comms/` - Módulos para comunicación (`Discovery`, `TuyaUDP`, `TuyaTCP`)
- `ui/` - Componentes de interfaz de usuario para el plugin

---

## 🖥️ Requisitos

- [SignalRGB](https://www.signalrgb.com/) instalado en tu PC (Windows).
- Dispositivo(s) Tuya WiFi **en la misma red local**.
- Node.js >= 14 (en entornos de desarrollo/test).

---

## 🚀 Instalación y configuración

1. **Clona el repositorio** o descarga el ZIP y descomprímelo:
   ```bash
   git clone https://github.com/BKMEN/TUYA-ACTION-SIGNALRGB.git
   ```
