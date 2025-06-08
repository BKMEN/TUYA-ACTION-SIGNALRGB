import readline from 'node:readline';

export async function askLocalKey(deviceId) {
    let key = null;
    while (!key) {
        key = await new Promise(resolve => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question(`Introduce la localKey para el dispositivo ${deviceId}: `, answer => {
                rl.close();
                resolve((answer || '').trim());
            });
        });
        if (!key) {
            console.log('La localKey es obligatoria.');
        }
    }
    return key;
}
