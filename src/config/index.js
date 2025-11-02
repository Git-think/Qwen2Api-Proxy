const dotenv = require('dotenv');
dotenv.config();
const dataPersistence = require('../utils/data-persistence');

let configInstance = null;

const parseValue = (value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === null || value === undefined) return null;
    if (!isNaN(value) && value.toString().trim() !== '') return Number(value);
    return value;
};

const loadConfig = async () => {
    if (configInstance) {
        return configInstance;
    }

    const dynamicSettings = await dataPersistence.loadSettings();

    const parseApiKeys = (apiKeyEnv) => {
        if (!apiKeyEnv) return { apiKeys: [], adminKey: null };
        const keys = apiKeyEnv.split(',').map(key => key.trim()).filter(key => key.length > 0);
        return { apiKeys: keys, adminKey: keys.length > 0 ? keys : null };
    };

    const parseSocks5Proxies = (proxyEnv) => {
        if (!proxyEnv) return [];
        return proxyEnv.split(/\r?\n|,/).map(proxy => proxy.trim()).filter(proxy => proxy.length > 0);
    };

    const envConfig = {
        DATA_SAVE_MODE: process.env.DATA_SAVE_MODE,
        API_KEY: process.env.API_KEY,
        SOCKS5_PROXIES: process.env.SOCKS5_PROXIES,
        SIMPLE_MODEL_MAP: process.env.SIMPLE_MODEL_MAP,
        LISTEN_ADDRESS: process.env.LISTEN_ADDRESS,
        SERVICE_PORT: process.env.SERVICE_PORT,
        SEARCH_INFO_MODE: process.env.SEARCH_INFO_MODE,
        OUTPUT_THINK: process.env.OUTPUT_THINK,
        REDIS_URL: process.env.REDIS_URL,
        CACHE_MODE: process.env.CACHE_MODE,
        LOG_LEVEL: process.env.LOG_LEVEL,
        ENABLE_FILE_LOG: process.env.ENABLE_FILE_LOG,
        LOG_DIR: process.env.LOG_DIR,
        MAX_LOG_FILE_SIZE: process.env.MAX_LOG_FILE_SIZE,
        MAX_LOG_FILES: process.env.MAX_LOG_FILES,
        SSXMOD_ITNA: process.env.SSXMOD_ITNA,
        SSXMOD_ITNA2: process.env.SSXMOD_ITNA2,
    };

    // 优先级: 动态设置 > 环境变量 > 默认值
    const combinedSettings = {};
    Object.keys(envConfig).forEach(key => {
        combinedSettings[key] = dynamicSettings[key] !== undefined ? dynamicSettings[key] : envConfig[key];
    });


    const { apiKeys, adminKey } = parseApiKeys(combinedSettings.API_KEY);
    const socks5Proxies = parseSocks5Proxies(combinedSettings.SOCKS5_PROXIES);

    configInstance = {
        dataSaveMode: combinedSettings.DATA_SAVE_MODE || "none",
        apiKeys: apiKeys,
        adminKey: adminKey,
        socks5Proxies: socks5Proxies,
        simpleModelMap: parseValue(combinedSettings.SIMPLE_MODEL_MAP) || false,
        listenAddress: combinedSettings.LISTEN_ADDRESS || null,
        listenPort: parseValue(combinedSettings.SERVICE_PORT) || 3000,
        searchInfoMode: combinedSettings.SEARCH_INFO_MODE || "text",
        outThink: parseValue(combinedSettings.OUTPUT_THINK) || false,
        redisURL: combinedSettings.REDIS_URL || null,
        autoRefresh: true,
        autoRefreshInterval: 6 * 60 * 60,
        cacheMode: combinedSettings.CACHE_MODE || "default",
        logLevel: combinedSettings.LOG_LEVEL || "INFO",
        enableFileLog: parseValue(combinedSettings.ENABLE_FILE_LOG) || false,
        logDir: combinedSettings.LOG_DIR || "./logs",
        maxLogFileSize: parseValue(combinedSettings.MAX_LOG_FILE_SIZE) || 10,
        maxLogFiles: parseValue(combinedSettings.MAX_LOG_FILES) || 5,
        ssxmodItna: combinedSettings.SSXMOD_ITNA || "1-Gqfx0DR70QdiqY5i7G7GqDODkAb07qYWDzxC5iOD_xQ5K08D6GDBRRQpq9YP0=CdiYiEhqqiKxC5D/Ai7eDZDGKQDqx0Er0CQ00t=lQYWYTelGi4xx=K7SAYuziWtAGbeiBEeBDMfOwM6z4hoqQGN9S4hrDB3DbqDyFiro5xGGj4GwDGoD34DiDDPDbSrDAMeD7qDFlmnTrPWDm4GWleGfDDoDYRTQxitoDDUA8nwa4cDD0L04Lm5SfayKZZeN31x1EG4Nx0UaDBd4/9DNqKC2=Ga12FMOa4TDzqzDtqcT8ZrNIoWHT19riGqjwqKr_K0YYDTFDPKDe3R4nDx22q/R4gxx1GYGDecA_YrHDgYDDWYh5DlmtG487e2wz9qsSke5j53xrcjIpexLr=q0QM7xM05qoYFBxZDhiD4rm5Erro444D",
        ssxmodItna2: combinedSettings.SSXMOD_ITNA2 || "1-Gqfx0DR70QdiqY5i7G7GqDODkAb07qYWDzxC5iOD_xQ5K08D6GDBRRQpq9YP0=CdiYiEhqqiKxCeDAKPehqmKxj_xEt1DGNdb1GiS4q7rQi3xRdAGZGWssrGZ2yudGMGdXXOhGsGIXn50U2/qdtm_4VzDL_tmD4EA3MFGD2tn=cmbK46qIP/3=Nhh4UR8WroaLQ51hxbaTGfj3P3cWNkiQVSm0xGYTXWexYS6uaEuhx0qK40MF5hmQ5CA5=0bOqkq6fo0Lhtmaj4S0zX1irTn7sV3QXf8xz0_5NV=QYlbW5X1drd9cssunr=e3aPOamriD4DKzjwfGqq755nKefi6e0_D29GYb7D40xzn33eRPQ4eQ4q7R1QRE=mG7h5nqWzbbjrxD",
    };
    return configInstance;
};

module.exports = loadConfig;
