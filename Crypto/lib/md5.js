// filepath: c:\Users\zorro\Documents\PLUGIN\TUYA-ACTION-SIGNALRGB\Crypto\lib\md5.js
/**
 * MD5 Implementation para SignalRGB
 * Basado en CryptoJS MD5
 */

const CryptoJS = require('./core.js');

// MD5 Implementation
const MD5 = function(message, options) {
    return MD5._createHelper(MD5._createHasher())(message, options);
};

MD5._createHasher = function() {
    const Hasher = class {
        constructor(cfg) {
            this.cfg = Object.assign({}, cfg);
            this.reset();
        }

        reset() {
            this._data = new CryptoJS.lib.WordArray();
            this._nDataBytes = 0;
            this._hash = new CryptoJS.lib.WordArray([
                0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476
            ]);
        }

        update(messageUpdate) {
            if (typeof messageUpdate === 'string') {
                messageUpdate = CryptoJS.enc.Utf8.parse(messageUpdate);
            }

            this._data.concat(messageUpdate);
            this._nDataBytes += messageUpdate.sigBytes;

            const data = this._data;
            const dataWords = data.words;
            const dataSigBytes = data.sigBytes;
            const blockSize = 16; // 64 bytes
            const blockSizeBytes = blockSize * 4;

            const nBlocksReady = Math.floor(dataSigBytes / blockSizeBytes);
            if (nBlocksReady) {
                for (let offset = 0; offset < nBlocksReady * blockSize; offset += blockSize) {
                    this._doProcessBlock(dataWords, offset);
                }

                const processedWords = dataWords.splice(0, nBlocksReady * blockSize);
                data.sigBytes -= blockSizeBytes * nBlocksReady;
            }

            return this;
        }

        finalize(messageUpdate) {
            if (messageUpdate) {
                this.update(messageUpdate);
            }

            const data = this._data;
            const dataWords = data.words;
            const nBitsTotal = this._nDataBytes * 8;
            const nBitsLeft = data.sigBytes * 8;

            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);

            const nBitsTotalH = Math.floor(nBitsTotal / 0x100000000);
            const nBitsTotalL = nBitsTotal;
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = (
                (((nBitsTotalH << 8) | (nBitsTotalH >>> 24)) & 0x00ff00ff) |
                (((nBitsTotalH << 24) | (nBitsTotalH >>> 8)) & 0xff00ff00)
            );
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = (
                (((nBitsTotalL << 8) | (nBitsTotalL >>> 24)) & 0x00ff00ff) |
                (((nBitsTotalL << 24) | (nBitsTotalL >>> 8)) & 0xff00ff00)
            );

            data.sigBytes = (dataWords.length + 1) * 4;

            this._process();

            const hash = this._hash;
            const H = hash.words;

            for (let i = 0; i < 4; i++) {
                const H_i = H[i];
                H[i] = (((H_i << 8) | (H_i >>> 24)) & 0x00ff00ff) |
                       (((H_i << 24) | (H_i >>> 8)) & 0xff00ff00);
            }

            return hash;
        }

        _process() {
            const data = this._data;
            const dataWords = data.words;
            const dataSigBytes = data.sigBytes;
            const blockSize = 16;
            const blockSizeBytes = blockSize * 4;

            let nBlocksReady = Math.floor(dataSigBytes / blockSizeBytes);
            if (!nBlocksReady) {
                nBlocksReady = 1;
            }

            const nWordsReady = nBlocksReady * blockSize;
            const nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

            if (nWordsReady) {
                for (let offset = 0; offset < nWordsReady; offset += blockSize) {
                    this._doProcessBlock(dataWords, offset);
                }

                const processedWords = dataWords.splice(0, nWordsReady);
                data.sigBytes -= nBytesReady;
            }
        }

        _doProcessBlock(M, offset) {
            const H = this._hash.words;
            let a = H[0], b = H[1], c = H[2], d = H[3];

            // Round 1
            a = FF(a, b, c, d, M[offset + 0], 7, 0xd76aa478);
            d = FF(d, a, b, c, M[offset + 1], 12, 0xe8c7b756);
            c = FF(c, d, a, b, M[offset + 2], 17, 0x242070db);
            b = FF(b, c, d, a, M[offset + 3], 22, 0xc1bdceee);
            a = FF(a, b, c, d, M[offset + 4], 7, 0xf57c0faf);
            d = FF(d, a, b, c, M[offset + 5], 12, 0x4787c62a);
            c = FF(c, d, a, b, M[offset + 6], 17, 0xa8304613);
            b = FF(b, c, d, a, M[offset + 7], 22, 0xfd469501);
            a = FF(a, b, c, d, M[offset + 8], 7, 0x698098d8);
            d = FF(d, a, b, c, M[offset + 9], 12, 0x8b44f7af);
            c = FF(c, d, a, b, M[offset + 10], 17, 0xffff5bb1);
            b = FF(b, c, d, a, M[offset + 11], 22, 0x895cd7be);
            a = FF(a, b, c, d, M[offset + 12], 7, 0x6b901122);
            d = FF(d, a, b, c, M[offset + 13], 12, 0xfd987193);
            c = FF(c, d, a, b, M[offset + 14], 17, 0xa679438e);
            b = FF(b, c, d, a, M[offset + 15], 22, 0x49b40821);

            // Round 2
            a = GG(a, b, c, d, M[offset + 1], 5, 0xf61e2562);
            d = GG(d, a, b, c, M[offset + 6], 9, 0xc040b340);
            c = GG(c, d, a, b, M[offset + 11], 14, 0x265e5a51);
            b = GG(b, c, d, a, M[offset + 0], 20, 0xe9b6c7aa);
            a = GG(a, b, c, d, M[offset + 5], 5, 0xd62f105d);
            d = GG(d, a, b, c, M[offset + 10], 9, 0x02441453);
            c = GG(c, d, a, b, M[offset + 15], 14, 0xd8a1e681);
            b = GG(b, c, d, a, M[offset + 4], 20, 0xe7d3fbc8);
            a = GG(a, b, c, d, M[offset + 9], 5, 0x21e1cde6);
            d = GG(d, a, b, c, M[offset + 14], 9, 0xc33707d6);
            c = GG(c, d, a, b, M[offset + 3], 14, 0xf4d50d87);
            b = GG(b, c, d, a, M[offset + 8], 20, 0x455a14ed);
            a = GG(a, b, c, d, M[offset + 13], 5, 0xa9e3e905);
            d = GG(d, a, b, c, M[offset + 2], 9, 0xfcefa3f8);
            c = GG(c, d, a, b, M[offset + 7], 14, 0x676f02d9);
            b = GG(b, c, d, a, M[offset + 12], 20, 0x8d2a4c8a);

            // Round 3
            a = HH(a, b, c, d, M[offset + 5], 4, 0xfffa3942);
            d = HH(d, a, b, c, M[offset + 8], 11, 0x8771f681);
            c = HH(c, d, a, b, M[offset + 11], 16, 0x6d9d6122);
            b = HH(b, c, d, a, M[offset + 14], 23, 0xfde5380c);
            a = HH(a, b, c, d, M[offset + 1], 4, 0xa4beea44);
            d = HH(d, a, b, c, M[offset + 4], 11, 0x4bdecfa9);
            c = HH(c, d, a, b, M[offset + 7], 16, 0xf6bb4b60);
            b = HH(b, c, d, a, M[offset + 10], 23, 0xbebfbc70);
            a = HH(a, b, c, d, M[offset + 13], 4, 0x289b7ec6);
            d = HH(d, a, b, c, M[offset + 0], 11, 0xeaa127fa);
            c = HH(c, d, a, b, M[offset + 3], 16, 0xd4ef3085);
            b = HH(b, c, d, a, M[offset + 6], 23, 0x04881d05);
            a = HH(a, b, c, d, M[offset + 9], 4, 0xd9d4d039);
            d = HH(d, a, b, c, M[offset + 12], 11, 0xe6db99e5);
            c = HH(c, d, a, b, M[offset + 15], 16, 0x1fa27cf8);
            b = HH(b, c, d, a, M[offset + 2], 23, 0xc4ac5665);

            // Round 4
            a = II(a, b, c, d, M[offset + 0], 6, 0xf4292244);
            d = II(d, a, b, c, M[offset + 7], 10, 0x432aff97);
            c = II(c, d, a, b, M[offset + 14], 15, 0xab9423a7);
            b = II(b, c, d, a, M[offset + 5], 21, 0xfc93a039);
            a = II(a, b, c, d, M[offset + 12], 6, 0x655b59c3);
            d = II(d, a, b, c, M[offset + 3], 10, 0x8f0ccc92);
            c = II(c, d, a, b, M[offset + 10], 15, 0xffeff47d);
            b = II(b, c, d, a, M[offset + 1], 21, 0x85845dd1);
            a = II(a, b, c, d, M[offset + 8], 6, 0x6fa87e4f);
            d = II(d, a, b, c, M[offset + 15], 10, 0xfe2ce6e0);
            c = II(c, d, a, b, M[offset + 6], 15, 0xa3014314);
            b = II(b, c, d, a, M[offset + 13], 21, 0x4e0811a1);
            a = II(a, b, c, d, M[offset + 4], 6, 0xf7537e82);
            d = II(d, a, b, c, M[offset + 11], 10, 0xbd3af235);
            c = II(c, d, a, b, M[offset + 2], 15, 0x2ad7d2bb);
            b = II(b, c, d, a, M[offset + 9], 21, 0xeb86d391);

            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
        }
    };

    return Hasher;
};

MD5._createHelper = function(hasher) {
    return function(message, cfg) {
        const hasherInstance = new hasher(cfg);
        return hasherInstance.finalize(message);
    };
};

// MD5 round functions
function FF(a, b, c, d, x, s, t) {
    const n = a + ((b & c) | (~b & d)) + x + t;
    return ((n << s) | (n >>> (32 - s))) + b;
}

function GG(a, b, c, d, x, s, t) {
    const n = a + ((b & d) | (c & ~d)) + x + t;
    return ((n << s) | (n >>> (32 - s))) + b;
}

function HH(a, b, c, d, x, s, t) {
    const n = a + (b ^ c ^ d) + x + t;
    return ((n << s) | (n >>> (32 - s))) + b;
}

function II(a, b, c, d, x, s, t) {
    const n = a + (c ^ (b | ~d)) + x + t;
    return ((n << s) | (n >>> (32 - s))) + b;
}

CryptoJS.MD5 = MD5;

export default CryptoJS;
