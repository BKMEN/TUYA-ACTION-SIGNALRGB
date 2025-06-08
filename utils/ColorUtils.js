export function hexToRgb(hex) {
    if (typeof hex !== 'string') {
        return { r: 0, g: 0, b: 0 };
    }
    let h = hex.replace('#', '').trim();
    if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
    }
    if (h.length !== 6) {
        return { r: 0, g: 0, b: 0 };
    }
    const int = parseInt(h, 16);
    return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255
    };
}
