/**
 * Simple color-aware logger used throughout the plugin.
 * Provides basic log levels with a consistent prefix so logs
 * are easy to spot in SignalRGB's console output.
 */
const COLOR_RESET = '\u001b[0m';
const COLORS = {
    debug: '\u001b[36m',   // cyan
    info: '\u001b[32m',    // green
    warn: '\u001b[33m',    // yellow
    error: '\u001b[31m'    // red
};

const PREFIX = '[TuyaPlugin]';

function format(level, args) {
    const color = COLORS[level] || COLORS.info;
    return `${color}${PREFIX}${COLOR_RESET} ${args.join(' ')}`;
}

export default {
    debug: (...a) => console.debug(format('debug', a)),
    info: (...a) => console.log(format('info', a)),
    warn: (...a) => console.warn(format('warn', a)),
    error: (...a) => console.error(format('error', a))
};

