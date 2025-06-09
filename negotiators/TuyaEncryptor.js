import crypto from 'node:crypto';

export default class TuyaEncryptor {
    static encrypt(data, key, iv, aad) {
        const cipher = crypto.createCipheriv('aes-128-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
        if (aad) cipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad));
        const ciphertext = Buffer.concat([cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)), cipher.final()]);
        return { ciphertext, tag: cipher.getAuthTag() };
    }

    static decrypt(ciphertext, key, iv, tag, aad) {
        try {
            const decipher = crypto.createDecipheriv('aes-128-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
            if (typeof service !== 'undefined') {
                service.log('🔐 Decrypt GCM params:');
                service.log(` - Encrypted Data: ${Buffer.isBuffer(ciphertext) ? ciphertext.toString('hex') : ciphertext}`);
                service.log(` - Nonce: ${iv}`);
                service.log(` - AAD: ${aad}`);
                service.log(` - Key: ${key}`);
                service.log(` - Tag: ${Buffer.isBuffer(tag) ? tag.toString('hex') : tag}`);
            }
            decipher.setAuthTag(Buffer.from(tag));
            if (aad) decipher.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad));
            const plain = Buffer.concat([
                decipher.update(Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext)),
                decipher.final()
            ]);
            if (typeof service !== 'undefined') {
                service.log(`🟢 Decryption success: ${plain.toString('hex')}`);
            }
            return plain;
        } catch (err) {
            if (typeof service !== 'undefined') {
                service.log('❌ Decryption failed: ' + err.message);
            }
            return null;
        }
    }
}
