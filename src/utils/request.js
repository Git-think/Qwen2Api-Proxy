const axios = require('axios')
const config = require('../config/index.js')
const accountManager = require('./account.js')
const { logger } = require('./logger')


/**
 * 发送聊天请求
 * @param {Object} body - 请求体
 * @param {number} retryCount - 当前重试次数
 * @param {string} lastUsedEmail - 上次使用的邮箱（用于错误记录）
 * @returns {Promise<Object>} 响应结果
 */
const sendChatRequest = async (body) => {
    try {
        // 获取可用的令牌
        const currentToken = accountManager.getAccountToken()

        if (!currentToken) {
            logger.error('无法获取有效的访问令牌', 'TOKEN')
            return {
                status: false,
                response: null
            }
        }

        // 构建请求配置
        const requestConfig = {
            headers: {
                'authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 
                "Connection": "keep-alive",
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                ...(config.ssxmodItna && { 'Cookie': `ssxmod_itna=${config.ssxmodItna};ssxmod_itna2=${config.ssxmodItna2}` })
            },
            responseType: body.stream ? 'stream' : 'json',
            timeout: 60 * 1000,
        }

        // console.log(body)
        // console.log(requestConfig)

        const chat_id = await generateChatID(currentToken, body.model)

        logger.network(`发送聊天请求`, 'REQUEST')
        const response = await axios.post("https://chat.qwen.ai/api/v2/chat/completions?chat_id=" + chat_id, {
            ...body,
            chat_id: chat_id
        }, requestConfig)

        // 请求成功
        if (response.status === 200) {
            // console.log(response.data)
            return {
                currentToken: currentToken,
                status: true,
                response: response.data
            }
        }

    } catch (error) {
        console.log(error)
        logger.error('发送聊天请求失败', 'REQUEST', '', error.message)
        return {
            status: false,
            response: null
        }
    }
}

/**
 * 生成chat_id
 * @param {*} currentToken
 * @param {*} model
 * @returns {Promise<string|null>} 返回生成的chat_id，如果失败则返回null
 */
const generateChatID = async (currentToken, model) => {
    // 为了保持与 sendChatRequest 逻辑的一致性，我们也需要为 generateChatID 获取一个账户和代理
    // 但这里我们复用传入的 currentToken 对应的账户信息
    // 从 accountManager 获取当前 token 对应的账户邮箱，以便在失败时处理代理
    const accountInfo = accountManager.getAccountByEmail(accountManager.accountTokens.find(acc => acc.token === currentToken)?.email) || {};
    const email = accountInfo.email;
    const proxy = accountInfo.proxy;

    const requestConfig = {
        headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
            "Connection": "keep-alive",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br"
        },
        timeout: 60 * 1000,
    }

    // 如果有代理，则配置 axios 使用代理 Agent
    if (proxy) {
        try {
            const agent = new SocksProxyAgent(proxy);
            requestConfig.httpAgent = agent;
            requestConfig.httpsAgent = agent;
        } catch (agentError) {
            logger.error(`为generateChatID创建代理Agent失败 (${proxy}): ${agentError.message}`, 'PROXY')
        }
    }

    try {
        const response_data = await axios.post("https://chat.qwen.ai/api/v2/chats/new", {
            "title": "New Chat",
            "models": [
                model
            ],
            "chat_mode": "local",
            "chat_type": "t2i",
            "timestamp": new Date().getTime()
        }, requestConfig)

        // console.log(response_data.data)
        
        return response_data.data?.data?.id || null

    } catch (error) {
        // 解析代理URL以获取IP用于日志
        let proxyHostForLog = proxy || 'none';
        if (proxy) {
            try {
                const proxyUrl = new URL(proxy);
                proxyHostForLog = proxyUrl.hostname;
            } catch (e) { /* ignore */ }
        }
        logger.error(`生成chat_id失败 (账户: ${email} (${proxyHostForLog})): ${error.message}`, 'CHAT')
        
        // 同样检查网络错误
        const networkErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'];
        if (proxy && (networkErrorCodes.includes(error.code) || error.message.includes('timeout') || error.message.includes('ECONN') || error.message.includes('socket'))) {
            logger.warn(`检测到网络错误，可能由账户 ${email} (${proxyHostForLog}) 的代理引起，尝试重新分配...`, 'PROXY')
            await accountManager.handleNetworkFailure(email, proxy);
        }
        
        return null
    }
}

module.exports = {
    sendChatRequest,
    generateChatID
}