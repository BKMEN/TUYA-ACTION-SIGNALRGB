import crypto from 'crypto';

const GCM_IV = Buffer.from('000000000000000000000000', 'hex');
const HMAC_KEY = Buffer.from('45656c6c6f2c20576f726c64212121', 'hex');

class TuyaEncryptor {
    constructor(device) {
        this.device = device;
        this.negotiationKey = this.getNegotiationKey();
    }

    getNegotiationKey() {
        const hmac = crypto.createHmac('sha256', HMAC_KEY);
        hmac.update(this.device.localKey);
        return hmac.digest();
    }

    encryptNegotiationPayload(payloadString) {
        const aad = Buffer.alloc(0);
        const cipher = crypto.createCipheriv('aes-128-gcm', this.negotiationKey, GCM_IV, {
            authTagLength: 16
        });
        cipher.setAAD(aad);
        const encrypted = Buffer.concat([cipher.update(payloadString, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([encrypted, tag]);
    }

    static encrypt(data, key, iv, aad) {
        const cipher = crypto.createCipheriv('aes-128-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'), { authTagLength: 16 });
        if (aad) cipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad));
        const ciphertext = Buffer.concat([cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)), cipher.final()]);
        return { ciphertext, tag: cipher.getAuthTag() };
    }

    static decrypt(ciphertext, key, iv, tag, aad) {
        try {
            const decipher = crypto.createDecipheriv('aes-128-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
            if (aad) decipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad));
            decipher.setAuthTag(Buffer.isBuffer(tag) ? tag : Buffer.from(tag));
            const plain = Buffer.concat([decipher.update(Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext)), decipher.final()]);
            return plain;
        } catch {
            return null;
        }
    }
}

export { TuyaEncryptor };
