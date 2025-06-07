// service.js - bridge between QML interface and plugin backend
// SignalRGB loads this file to expose the global `service` object.
// When running outside of SignalRGB we provide a minimal stub with
// the necessary methods and event placeholders so that the QML UI
// and backend code can interact without throwing errors.

'use strict';

import EventEmitter from './utils/EventEmitter.js';

// Reuse existing global service if one was provided by SignalRGB
const existing = (typeof global !== 'undefined' && global.service) ? global.service : null;

// Basic service implementation using the simplified EventEmitter
class Service extends EventEmitter {
    emit(event, ...args) {
        if (this._eventHistory) {
            this._eventHistory.push({ event, args, ts: Date.now() });
        }
        return super.emit(event, ...args);
    }
}

const svc = existing || new Service();

// Mark when running in test/development mode
if (!existing) {
    console.log('[Service] Initialized in test mode'); // log early before logger
}

// -------------------------------------------------------------
// Provide default implementations for methods used throughout the
// project when running outside of the SignalRGB environment.
// -------------------------------------------------------------

if (typeof svc.log !== 'function') {
    svc.logLevel = 'debug';
    const logFn = (lvl, ...msg) => {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const cur = levels[svc.logLevel] ?? 0;
        const lvlIndex = levels[lvl] ?? 1;
        if (lvlIndex < cur) return;
        const prefix = `[${lvl.toUpperCase()}]`;
        switch (lvl) {
        case 'error':
            console.error(prefix, ...msg);
            break;
        case 'warn':
            console.warn(prefix, ...msg);
            break;
        case 'debug':
            console.debug(prefix, ...msg);
            break;
        default:
            console.log(prefix, ...msg);
        }
    };
    svc.log = (level, ...rest) => {
        if (typeof level === 'string' && ['debug','info','warn','error'].includes(level)) {
            logFn(level, ...rest);
        } else {
            logFn('info', level, ...rest);
        }
    };
    ['debug','info','warn','error'].forEach(l => {
        svc[l] = (...a) => svc.log(l, ...a);
    });
    if (!existing) {
        svc.debug('Service running in test mode');
    }
}

// Simple in-memory settings store for development/testing
svc._settings = svc._settings || {};
svc._eventHistory = svc._eventHistory || [];

if (typeof svc.getSetting !== 'function') {
    svc.getSetting = (section, key, def = '') => {
        const sec = svc._settings[section] || {};
        return Object.prototype.hasOwnProperty.call(sec, key) ? sec[key] : def;
    };
}

if (typeof svc.saveSetting !== 'function') {
    svc.saveSetting = (section, key, value) => {
        if (typeof section !== 'string' || typeof key !== 'string') return;
        if (!svc._settings[section]) svc._settings[section] = {};
        svc._settings[section][key] = value;
    };
}

// Events/callbacks referenced by the QML interface
['deviceConfigured', 'deviceError', 'negotiationComplete',
 'discoveryComplete', 'controllersChanged', 'addController',
 'announceController', 'deviceDiscovered'].forEach(fn => {
    let original = typeof svc[fn] === 'function' ? svc[fn] : null;
    const wrapper = (...a) => {
        svc.emit(fn, ...a);
        if (original) return original.apply(svc, a);
    };
    Object.defineProperty(svc, fn, {
        configurable: true,
        enumerable: true,
        get() { return wrapper; },
        set(fnVal) { original = (typeof fnVal === 'function') ? fnVal : null; }
    });
});

if (typeof svc.controllers === 'undefined') {
    svc.controllers = [];
}

svc.getEventHistory = () => [...svc._eventHistory];

svc.getStatusReport = () => {
    return {
        controllers: svc.controllers.length,
        initialized: !!svc.controllersChanged,
        readyForAnnounce: typeof svc.announceController === 'function',
        settingsStored: Object.keys(svc._settings).length
    };
};

if (typeof global !== 'undefined') {
    global.service = svc;
}

export default svc;


