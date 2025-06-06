// service.js - bridge between QML interface and plugin backend
// SignalRGB loads this file to expose the global `service` object.
// When running outside of SignalRGB we provide a minimal stub with
// the necessary methods and event placeholders so that the QML UI
// and backend code can interact without throwing errors.

import EventEmitter from './utils/EventEmitter.js';

// Reuse existing global service if one was provided by SignalRGB
const existing = (typeof global !== 'undefined' && global.service) ? global.service : null;

// Basic service implementation using the simplified EventEmitter
class Service extends EventEmitter {}

const svc = existing || new Service();

// -------------------------------------------------------------
// Provide default implementations for methods used throughout the
// project when running outside of the SignalRGB environment.
// -------------------------------------------------------------

if (typeof svc.log !== 'function') {
    svc.log = (...args) => console.log('[Service]', ...args);
}

// Simple in-memory settings store for development/testing
svc._settings = svc._settings || {};

if (typeof svc.getSetting !== 'function') {
    svc.getSetting = (section, key, def = '') => {
        const sec = svc._settings[section] || {};
        return Object.prototype.hasOwnProperty.call(sec, key) ? sec[key] : def;
    };
}

if (typeof svc.saveSetting !== 'function') {
    svc.saveSetting = (section, key, value) => {
        if (!svc._settings[section]) svc._settings[section] = {};
        svc._settings[section][key] = value;
    };
}

// Events/callbacks referenced by the QML interface
['deviceConfigured', 'deviceError', 'negotiationComplete',
 'discoveryComplete', 'controllersChanged', 'addController',
 'announceController', 'deviceDiscovered'].forEach(fn => {
    if (typeof svc[fn] !== 'function') {
        svc[fn] = () => {};
    }
});

if (typeof svc.controllers === 'undefined') {
    svc.controllers = [];
}

if (typeof global !== 'undefined') {
    global.service = svc;
}

export default svc;

