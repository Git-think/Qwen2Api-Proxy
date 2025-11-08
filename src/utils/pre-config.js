const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const SET_ENV_FILE = path.join(DATA_DIR, 'set-env');
const DATA_JSON_FILE = path.join(DATA_DIR, 'data.json');

function syncProcessSetEnv() {
    let data = {};

    // Step 1: Load settings from data.json first
    if (fs.existsSync(DATA_JSON_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf8'));
            if (data && data.settings && typeof data.settings === 'object') {
                console.log('[PRE-CONFIG] 从 data.json 加载设置...');
                for (const [key, value] of Object.entries(data.settings)) {
                    // Set process.env, but do not overwrite existing process.env values yet
                    // This allows .env to still be loaded and have lower priority
                    if (process.env[key] === undefined) {
                        process.env[key] = value;
                    }
                }
            }
        } catch (e) {
            console.error('[PRE-CONFIG] 解析 data.json 失败，将创建新的配置。', e);
            data = {};
        }
    }

    // Ensure data object has the required structure
    const requiredKeys = ['settings', 'accounts', 'proxies', 'proxyBindings'];
    requiredKeys.forEach(key => {
        if (!data[key]) {
            data[key] = (key === 'settings' || key === 'proxyBindings') ? {} : [];
        }
    });

    // Step 2: Process set-env file, which has the highest priority
    try {
        if (fs.existsSync(SET_ENV_FILE)) {
            console.log('[PRE-CONFIG] 检测到 set-env 文件，正在处理...');
            const content = fs.readFileSync(SET_ENV_FILE, 'utf8');
            const lines = content.split(/\r?\n/);

            for (const line of lines) {
                const [key, ...values] = line.split('=');
                const value = values.join('=').trim();
                if (key && value) {
                    const trimmedKey = key.trim();
                    console.log(`[PRE-CONFIG] 设置环境变量 (from set-env): ${trimmedKey}=${value}`);
                    // Directly overwrite process.env, ensuring highest priority
                    process.env[trimmedKey] = value;
                    // Save to data.json for persistence
                    data.settings[trimmedKey] = value;
                }
            }

            fs.writeFileSync(DATA_JSON_FILE, JSON.stringify(data, null, 2), 'utf8');
            fs.unlinkSync(SET_ENV_FILE);
            console.log('[PRE-CONFIG] set-env 文件处理完毕并已删除。');
        }
    } catch (error) {
        console.error('[PRE-CONFIG] 处理 set-env 文件失败:', error);
    }
}

module.exports = { syncProcessSetEnv };