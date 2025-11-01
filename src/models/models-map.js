const axios = require('axios')
const accountManager = require('../utils/account.js')
const config = require('../config/index.js')

let cachedModels = null
let fetchPromise = null

const getLatestModels = async (force = false) => {
    // 如果有缓存且不强制刷新，直接返回
    if (cachedModels && !force) {
        return cachedModels
    }
    
    // 如果正在获取，返回当前的 Promise
    if (fetchPromise) {
        return fetchPromise
    }
    
    fetchPromise = axios.get('https://chat.qwen.ai/api/models', {
        headers: {
            'Authorization': `Bearer ${accountManager.getAccountToken()}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(config.ssxmodItna && { 'Cookie': `ssxmod_itna=${config.ssxmodItna};ssxmod_itna2=${config.ssxmodItna2}` })
        }
    }).then(response => {
        // console.log(response)
        cachedModels = response.data.data
        fetchPromise = null
        return cachedModels
    }).catch(error => {
        console.error('Error fetching latest models:', error)
        fetchPromise = null
        return []
    })
    
    return fetchPromise
}

module.exports = { getLatestModels }