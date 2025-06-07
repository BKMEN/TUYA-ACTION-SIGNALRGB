import net from 'node:net';
import assert from 'node:assert';
import TuyaTCP from '../comms/TuyaTCP.js';

(async () => {
    // create simple echo server
    const server = net.createServer(sock => {
        sock.on('data', d => sock.write(d));
    });
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const client = new TuyaTCP('127.0.0.1', port);
    await client.connect();
    await client.send('ping');
    client.close();
    server.close();
    console.log('TuyaTCP tests passed');
})();

