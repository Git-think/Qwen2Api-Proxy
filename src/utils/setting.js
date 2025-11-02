const fs = require('fs');
const path = require('path');
const dataPersistence = require('./data-persistence');

let settings = {};

try {
    if (dataPersistence.mode === 'file') {
        const filePath = path.join(__dirname, '../../data/data.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            if (jsonData && jsonData.settings) {
                settings = jsonData.settings;
            }
        }
    } else if (dataPersistence.mode === 'redis') {
        // For redis, we can't synchronously load the data here.
        // This will be handled asynchronously in the config file,
        // but we won't block the initial load.
    }
} catch (error) {
    // Ignore errors during initial settings load
}

module.exports = settings;