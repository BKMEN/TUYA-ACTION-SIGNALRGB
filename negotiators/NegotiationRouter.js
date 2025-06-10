export const activeNegotiators = new Map();

export function registerNegotiator(crc, negotiator) {
    if (!crc || !negotiator) return;
    activeNegotiators.set(crc.toLowerCase(), negotiator);
}

export function getNegotiator(crc) {
    return activeNegotiators.get((crc || '').toLowerCase());
}

export function removeNegotiator(crc) {
    activeNegotiators.delete((crc || '').toLowerCase());
}

