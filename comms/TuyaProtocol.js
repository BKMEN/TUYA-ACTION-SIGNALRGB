// TuyaProtocol.js

const TuyAPI = require('tuyapi');

class TuyaDevice {
  constructor({ id, key, ip, version = '3.3' }) {
    this.device = new TuyAPI({ id, key, ip, version });
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      try {
        await this.device.find();
        await this.device.connect();
        this.connected = true;
      } catch (error) {
        console.error(`Error connecting to device ${this.device.id}:`, error);
      }
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.device.disconnect();
      this.connected = false;
    }
  }

  async setPower(state) {
    await this.connect();
    try {
      await this.device.set({ set: state });
    } catch (error) {
      console.error(`Error setting power for device ${this.device.id}:`, error);
    }
  }

  async setBrightness(value) {
    await this.connect();
    try {
      await this.device.set({ dps: 22, set: value });
    } catch (error) {
      console.error(`Error setting brightness for device ${this.device.id}:`, error);
    }
  }

  async setColor({ h, s, v }) {
    await this.connect();
    try {
      const hsv = {
        h: Math.round(h),
        s: Math.round(s * 10),
        v: Math.round(v * 10),
      };
      await this.device.set({
        multiple: true,
        data: {
          21: 'colour',
          24: JSON.stringify(hsv),
        },
      });
    } catch (error) {
      console.error(`Error setting color for device ${this.device.id}:`, error);
    }
  }
}

module.exports = TuyaDevice;
