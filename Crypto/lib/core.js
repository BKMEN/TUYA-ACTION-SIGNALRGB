/**
 * CryptoJS Core
 * Implementación simplificada basada en CryptoJS para SignalRGB
 */

const CryptoJS = {};

// WordArray para manejar arrays de palabras
CryptoJS.lib = {};

CryptoJS.lib.WordArray = class WordArray {
    constructor(words, sigBytes) {
        this.words = words || [];
        this.sigBytes = sigBytes != null ? sigBytes : this.words.length * 4;
    }

    static create(words, sigBytes) {
        return new WordArray(words, sigBytes);
    }

    toString(encoder) {
        return (encoder || CryptoJS.enc.Hex).stringify(this);
    }

    concat(wordArray) {
        const thisWords = this.words;
        const thatWords = wordArray.words;
        const thisSigBytes = this.sigBytes;
        const thatSigBytes = wordArray.sigBytes;

        this.clamp();

        if (thisSigBytes % 4) {
            for (let i = 0; i < thatSigBytes; i++) {
                const thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
            }
        } else {
            for (let i = 0; i < thatSigBytes; i += 4) {
                thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
            }
        }
        this.sigBytes = thisSigBytes + thatSigBytes;

        return this;
    }

    clamp() {
        const words = this.words;
        const sigBytes = this.sigBytes;

        words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
        words.length = Math.ceil(sigBytes / 4);
    }

    clone() {
        return new WordArray([...this.words], this.sigBytes);
    }
};

// Encoders
CryptoJS.enc = {};

CryptoJS.enc.Hex = {
    stringify: function(wordArray) {
        const words = wordArray.words;
        const sigBytes = wordArray.sigBytes;
        const hexChars = [];

        for (let i = 0; i < sigBytes; i++) {
            const bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
            hexChars.push((bite >>> 4).toString(16));
            hexChars.push((bite & 0x0f).toString(16));
        }

        return hexChars.join('');
    },

    parse: function(hexStr) {
        const hexStrLength = hexStr.length;
        const words = [];

        for (let i = 0; i < hexStrLength; i += 2) {
            words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
        }

        return new CryptoJS.lib.WordArray(words, hexStrLength / 2);
    }
};

CryptoJS.enc.Utf8 = {
    stringify: function(wordArray) {
        try {
            return decodeURIComponent(escape(CryptoJS.enc.Latin1.stringify(wordArray)));
        } catch (e) {
            throw new Error('Malformed UTF-8 data');
        }
    },

    parse: function(utf8Str) {
        return CryptoJS.enc.Latin1.parse(unescape(encodeURIComponent(utf8Str)));
    }
};

CryptoJS.enc.Latin1 = {
    stringify: function(wordArray) {
        const words = wordArray.words;
        const sigBytes = wordArray.sigBytes;
        const latin1Chars = [];

        for (let i = 0; i < sigBytes; i++) {
            const bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
            latin1Chars.push(String.fromCharCode(bite));
        }

        return latin1Chars.join('');
    },

    parse: function(latin1Str) {
        const latin1StrLength = latin1Str.length;
        const words = [];

        for (let i = 0; i < latin1StrLength; i++) {
            words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
        }

        return new CryptoJS.lib.WordArray(words, latin1StrLength);
    }
};

CryptoJS.enc.Base64 = {
    stringify: function(wordArray) {
        const words = wordArray.words;
        const sigBytes = wordArray.sigBytes;
        const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

        const base64Chars = [];

        for (let i = 0; i < sigBytes; i += 3) {
            const byte1 = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
            const byte2 = (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
            const byte3 = (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

            const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

            for (let j = 0; (j < 4) && (i + j * 0.75 < sigBytes); j++) {
                base64Chars.push(map.charAt((triplet >>> (6 * (3 - j))) & 0x3f));
            }
        }

        const paddingChar = map.charAt(64);
        if (paddingChar) {
            while (base64Chars.length % 4) {
                base64Chars.push(paddingChar);
            }
        }

        return base64Chars.join('');
    },

    parse: function(base64Str) {
        let base64StrLength = base64Str.length;
        const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

        let paddingChar = map.charAt(64);
        if (paddingChar) {
            const paddingIndex = base64Str.indexOf(paddingChar);
            if (paddingIndex !== -1) {
                base64StrLength = paddingIndex;
            }
        }

        const words = [];
        let nBytes = 0;
        for (let i = 0; i < base64StrLength; i++) {
            if (i % 4) {
                const bits1 = map.indexOf(base64Str.charAt(i - 1)) << ((i % 4) * 2);
                const bits2 = map.indexOf(base64Str.charAt(i)) >>> (6 - (i % 4) * 2);
                words[nBytes >>> 2] |= (bits1 | bits2) << (24 - (nBytes % 4) * 8);
                nBytes++;
            }
        }

        return new CryptoJS.lib.WordArray(words, nBytes);
    }
};

export default CryptoJS;
