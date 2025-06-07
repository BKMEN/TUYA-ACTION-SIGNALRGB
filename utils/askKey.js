import readline from 'node:readline';

export function askLocalKey(deviceId) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(`Introduce la localKey para el dispositivo ${deviceId}: `, answer => {
            rl.close();
            const key = (answer || '').trim();
            resolve(key || null);
        });
    });
}
