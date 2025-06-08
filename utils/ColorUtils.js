export function hexToRgb(hex) {
    if (typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
    let h = hex.replace('#', '');
    if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
    }
    const num = parseInt(h, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}
export default { hexToRgb };
