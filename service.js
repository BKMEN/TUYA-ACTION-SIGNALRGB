// service.js - bridge between QML interface and plugin backend
// SignalRGB loads this file to expose the global `service` object.
// When running outside of SignalRGB we provide a minimal stub.

const svc = (typeof global !== 'undefined' && global.service) ? global.service : {};

if (typeof global !== 'undefined') {
    global.service = svc;
}

export default svc;

