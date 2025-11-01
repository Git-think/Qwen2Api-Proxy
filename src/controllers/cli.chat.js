const axios = require('axios')
const { logger } = require('../utils/logger')

/**
 * 处理CLI聊天完成请求（支持OpenAI格式的流式和JSON响应）
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
const handleCliChatCompletion = async (req, res) => {
    try {
        const access_token = req.account.cli_info.access_token
        const body = req.body
        const isStream = body.stream === true

        // 打印当前使用的账号邮箱
        logger.info(`CLI请求使用账号[${req.account.email}]开始处理`, 'CLI', '🚀')

        // 无论成功失败都增加请求计数
        req.account.cli_info.request_number++

        // 设置请求配置
        const axiosConfig = {
            method: 'POST',
            url: 'https://portal.qwen.ai/v1/chat/completions',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
                'Accept': isStream ? 'text/event-stream' : 'application/json'
            },
            data: body,
            timeout: 5 * 60 * 1000,
            validateStatus: function () {
                return true
            }
        }

        // 如果是流式请求，设置响应类型为流
        if (isStream) {
            axiosConfig.responseType = 'stream'

            // 设置响应头为流式
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Headers', '*')
        }

        const response = await axios(axiosConfig)

        // 检查响应状态
        if (response.status !== 200) {
            logger.error(`CLI请求使用账号[${req.account.email}]转发失败 - 状态码: ${response.status} - 当前请求数: ${req.account.cli_info.request_number}`, 'CLI', '❌')
            return res.status(response.status).json({
                error: {
                    message: `api_error`,
                    type: 'api_error',
                    code: response.status,
                    details: response.data
                }
            })
        }

        // 处理流式响应
        if (isStream) {
            // 直接管道传输流式数据
            response.data.pipe(res)

            // 处理流错误
            response.data.on('error', (streamError) => {
                logger.error(`CLI请求使用账号[${req.account.email}]流式传输失败 - 当前请求数: ${req.account.cli_info.request_number}`, 'CLI', '❌')
                if (!res.headersSent) {
                    res.status(500).json({
                        error: {
                            message: 'stream_error',
                            type: 'stream_error',
                            code: 500
                        }
                    })
                }
            })

            // 处理流结束
            response.data.on('end', () => {
                logger.success(`CLI请求使用账号[${req.account.email}]转发成功 (流式) - 当前请求数: ${req.account.cli_info.request_number}`, 'CLI')
                res.end()
            })
        } else {
            // 处理JSON响应
            res.json(response.data)
            logger.success(`CLI请求使用账号[${req.account.email}]转发成功 (JSON) - 当前请求数: ${req.account.cli_info.request_number}`, 'CLI')
        }
    } catch (error) {
        logger.error(`CLI请求使用账号[${req.account.email}]处理异常 - 当前请求数: ${req.account.cli_info.request_number}`, 'CLI', '💥', error.message)

        // 如果是axios错误，提供更详细的错误信息
        if (error.response) {
            return res.status(error.response.status).json({
                error: {
                    message: "api_error",
                    type: 'api_error',
                    code: error.response.status,
                    details: error.response.data
                }
            })
        } else if (error.request) {
            return res.status(503).json({
                error: {
                    message: 'connection_error',
                    type: 'connection_error',
                    code: 503
                }
            })
        } else {
            return res.status(500).json({
                error: {
                    message: 'internal_error',
                    type: 'internal_error',
                    code: 500
                }
            })
        }
    }
}

module.exports = {
    handleCliChatCompletion
}