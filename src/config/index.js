const dotenv = require('dotenv')
dotenv.config()

/**
 * 解析API_KEY环境变量，支持逗号分隔的多个key
 * @returns {Object} 包含apiKeys数组和adminKey的对象
 */
const parseApiKeys = () => {
    const apiKeyEnv = process.env.API_KEY
    if (!apiKeyEnv) {
        return { apiKeys: [], adminKey: null }
    }

    const keys = apiKeyEnv.split(',').map(key => key.trim()).filter(key => key.length > 0)
    return {
        apiKeys: keys,
        adminKey: keys.length > 0 ? keys[0] : null
    }
}

/**
 * 解析SOCKS5_PROXIES环境变量，支持多行或逗号分隔的多个代理
 * @returns {Array} 代理地址数组
 */
const parseSocks5Proxies = () => {
    const proxyEnv = process.env.SOCKS5_PROXIES
    if (!proxyEnv) {
        return []
    }

    // 按换行符或逗号分割，过滤空值并去除首尾空白
    const proxies = proxyEnv.split(/\r?\n|,/).map(proxy => proxy.trim()).filter(proxy => proxy.length > 0)
    return proxies
}

const { apiKeys, adminKey } = parseApiKeys()
const socks5Proxies = parseSocks5Proxies()

const config = {
    dataSaveMode: process.env.DATA_SAVE_MODE || "none",
    apiKeys: apiKeys,
    adminKey: adminKey,
    socks5Proxies: socks5Proxies, // 添加 SOCKS5 代理列表
    simpleModelMap: process.env.SIMPLE_MODEL_MAP === 'true' ? true : false,
    listenAddress: process.env.LISTEN_ADDRESS || null,
    listenPort: process.env.SERVICE_PORT || 3000,
    searchInfoMode: process.env.SEARCH_INFO_MODE === 'table' ? "table" : "text",
    outThink: process.env.OUTPUT_THINK === 'true' ? true : false,
    redisURL: process.env.REDIS_URL || null,
    autoRefresh: true,
    autoRefreshInterval: 6 * 60 * 60,
    cacheMode: process.env.CACHE_MODE || "default",
    logLevel: process.env.LOG_LEVEL || "INFO",
    enableFileLog: process.env.ENABLE_FILE_LOG === 'true',
    logDir: process.env.LOG_DIR || "./logs",
    maxLogFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE) || 10,
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 5,
    ssxmodItna: process.env.SSXMOD_ITNA || "1-Gqfx0DR70QdiqY5i7G7GqDODkAb07qYWDzxC5iOD_xQ5K08D6GDBRRQpq9YP0=CdiYiEhqqiKxC5D/Ai7eDZDGKQDqx0Er0CQ00t=lQYWYTelGi4xx=K7SAYuziWtAGbeiBEeBDMfOwM6z4hoqQGN9S4hrDB3DbqDyFiro5xGGj4GwDGoD34DiDDPDbSrDAMeD7qDFlmnTrPWDm4GWleGfDDoDYRTQxitoDDUA8nwa4cDD0L04Lm5SfayKZZeN31x1EG4Nx0UaDBd4/9DNqKC2=Ga12FMOa4TDzqzDtqcT8ZrNIoWHT19riGqjwqKr_K0YYDTFDPKDe3R4nDx22q/R4gxx1GYGDecA_YrHDgYDDWYh5DlmtG487e2wz9qsSke5j53xrcjIpexLr=q0QM7xM05qoYFBxZDhiD4rm5Erro444D",
    ssxmodItna2: process.env.SSXMOD_ITNA || "1-Gqfx0DR70QdiqY5i7G7GqDODkAb07qYWDzxC5iOD_xQ5K08D6GDBRRQpq9YP0=CdiYiEhqqiKxCeDAKPehqmKxj_xEt1DGNdb1GiS4q7rQi3xRdAGZGWssrGZ2yudGMGdXXOhGsGIXn50U2/qdtm_4VzDL_tmD4EA3MFGD2tn=cmbK46qIP/3=Nhh4UR8WroaLQ51hxbaTGfj3P3cWNkiQVSm0xGYTXWexYS6uaEuhx0qK40MF5hmQ5CA5=0bOqkq6fo0Lhtmaj4S0zX1irTn7sV3QXf8xz0_5NV=QYlbW5X1drd9cssunr=e3aPOamriD4DKzjwfGqq755nKefi6e0_D29GYb7D40xzn33eRPQ4eQ4q7R1QRE=mG7h5nqWzbbjrxD"
}

module.exports = config
