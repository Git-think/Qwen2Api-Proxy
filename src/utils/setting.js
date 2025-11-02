const fs = require('fs');
const path = require('path');

let settings = {};

try {
    const dataSaveMode = process.env.DATA_SAVE_MODE || 'none';
    if (dataSaveMode === 'file') {
        const filePath = path.join(__dirname, '../../data/data.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            if (jsonData && jsonData.settings) {
                settings = jsonData.settings;
            }
        }
    }
} catch (error) {
    // Ignore errors during initial settings load
}

module.exports = settings;