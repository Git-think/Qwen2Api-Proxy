const { isJson, generateUUID } = require('../utils/tools.js')
const { createUsageObject } = require('../utils/precise-tokenizer.js')
const { sendChatRequest } = require('../utils/request.js')
const accountManager = require('../utils/account.js')
const config = require('../config/index.js')
const axios = require('axios')
const { logger } = require('../utils/logger')

/**
 * 设置响应头
 * @param {object} res - Express 响应对象
 * @param {boolean} stream - 是否流式响应
 */
const setResponseHeaders = (res, stream) => {
    try {
        if (stream) {
            res.set({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            })
        } else {
            res.set({
                'Content-Type': 'application/json',
            })
        }
    } catch (e) {
        logger.error('处理聊天请求时发生错误', 'CHAT', '', e)
    }
}

/**
 * 处理流式响应
 * @param {object} res - Express 响应对象
 * @param {object} response - 上游响应流
 * @param {boolean} enable_thinking - 是否启用思考模式
 * @param {boolean} enable_web_search - 是否启用网络搜索
 * @param {object} requestBody - 原始请求体，用于提取prompt信息
 */
const handleStreamResponse = async (res, response, enable_thinking, enable_web_search, requestBody = null) => {
    try {
        const message_id = generateUUID()
        const decoder = new TextDecoder('utf-8')
        let web_search_info = null
        let thinking_start = false
        let thinking_end = false
        let buffer = ''

        // Token消耗量统计
        let totalTokens = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
        let completionContent = '' // 收集完整的回复内容用于token估算

        // 提取prompt文本用于token估算
        let promptText = ''
        if (requestBody && requestBody.messages) {
            promptText = requestBody.messages.map(msg => {
                if (typeof msg.content === 'string') {
                    return msg.content
                } else if (Array.isArray(msg.content)) {
                    return msg.content.map(item => item.text || '').join('')
                }
                return ''
            }).join('\n')
        }

        response.on('data', async (chunk) => {
            const decodeText = decoder.decode(chunk, { stream: true })
            buffer += decodeText

            const chunks = []
            let startIndex = 0

            while (true) {
                const dataStart = buffer.indexOf('data: ', startIndex)
                if (dataStart === -1) break

                const dataEnd = buffer.indexOf('\n\n', dataStart)
                if (dataEnd === -1) break

                const dataChunk = buffer.substring(dataStart, dataEnd).trim()
                chunks.push(dataChunk)

                startIndex = dataEnd + 2
            }

            if (startIndex > 0) {
                buffer = buffer.substring(startIndex)
            }

            for (const item of chunks) {
                try {
                    let dataContent = item.replace("data: ", '')
                    let decodeJson = isJson(dataContent) ? JSON.parse(dataContent) : null
                    if (decodeJson === null || !decodeJson.choices || decodeJson.choices.length === 0) {
                        continue
                    }

                    // 提取真实的usage信息（如果上游API提供）
                    if (decodeJson.usage) {
                        totalTokens = {
                            prompt_tokens: decodeJson.usage.prompt_tokens || totalTokens.prompt_tokens,
                            completion_tokens: decodeJson.usage.completion_tokens || totalTokens.completion_tokens,
                            total_tokens: decodeJson.usage.total_tokens || totalTokens.total_tokens
                        }
                    }

                    // 处理 web_search 信息
                    if (decodeJson.choices[0].delta && decodeJson.choices[0].delta.name === 'web_search') {
                        web_search_info = decodeJson.choices[0].delta.extra.web_search_info
                    }

                    if (!decodeJson.choices[0].delta || !decodeJson.choices[0].delta.content ||
                        (decodeJson.choices[0].delta.phase !== 'think' && decodeJson.choices[0].delta.phase !== 'answer')) {
                        continue
                    }

                    let content = decodeJson.choices[0].delta.content
                    completionContent += content // 累计完整内容用于token估算

                    if (decodeJson.choices[0].delta.phase === 'think' && !thinking_start) {
                        thinking_start = true
                        if (web_search_info) {
                            content = `<think>\n\n${await accountManager.generateMarkdownTable(web_search_info, config.searchInfoMode)}\n\n${content}`
                        } else {
                            content = `<think>\n\n${content}`
                        }
                    }
                    if (decodeJson.choices[0].delta.phase === 'answer' && !thinking_end && thinking_start) {
                        thinking_end = true
                        content = `\n\n</think>\n${content}`
                    }

                    const StreamTemplate = {
                        "id": `chatcmpl-${message_id}`,
                        "object": "chat.completion.chunk",
                        "created": new Date().getTime(),
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "content": content
                                },
                                "finish_reason": null
                            }
                        ]
                    }

                    res.write(`data: ${JSON.stringify(StreamTemplate)}\n\n`)
                } catch (error) {
                    logger.error('流式数据处理错误', 'CHAT', '', error)
                    res.status(500).json({ error: "服务错误!!!" })
                }
            }
        })

        response.on('end', async () => {
            try {
                // 处理最终的搜索信息
                if ((config.outThink === false || !enable_thinking) && web_search_info && config.searchInfoMode === "text") {
                    const webSearchTable = await accountManager.generateMarkdownTable(web_search_info, "text")
                    res.write(`data: ${JSON.stringify({
                        "id": `chatcmpl-${message_id}`,
                        "object": "chat.completion.chunk",
                        "created": new Date().getTime(),
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "content": `\n\n---\n${webSearchTable}`
                                },
                                "finish_reason": null
                            }
                        ]
                    })}\n\n`)
                }

                // 计算最终的token使用量
                if (totalTokens.prompt_tokens === 0 && totalTokens.completion_tokens === 0) {
                    totalTokens = createUsageObject(requestBody?.messages || promptText, completionContent, null)
                    logger.info(`流式使用tiktoken计算 - Prompt: ${totalTokens.prompt_tokens}, Completion: ${totalTokens.completion_tokens}, Total: ${totalTokens.total_tokens}`, 'CHAT')
                } else {
                    logger.info(`流式使用上游真实Token - Prompt: ${totalTokens.prompt_tokens}, Completion: ${totalTokens.completion_tokens}, Total: ${totalTokens.total_tokens}`, 'CHAT')
                }

                // 确保token数量的有效性
                totalTokens.prompt_tokens = Math.max(0, totalTokens.prompt_tokens || 0)
                totalTokens.completion_tokens = Math.max(0, totalTokens.completion_tokens || 0)
                totalTokens.total_tokens = totalTokens.prompt_tokens + totalTokens.completion_tokens

                // 发送最终的finish chunk，包含finish_reason
                res.write(`data: ${JSON.stringify({
                    "id": `chatcmpl-${message_id}`,
                    "object": "chat.completion.chunk",
                    "created": new Date().getTime(),
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop"
                        }
                    ]
                })}\n\n`)

                // 发送usage信息chunk（符合OpenAI API标准）
                res.write(`data: ${JSON.stringify({
                    "id": `chatcmpl-${message_id}`,
                    "object": "chat.completion.chunk",
                    "created": new Date().getTime(),
                    "choices": [],
                    "usage": totalTokens
                })}\n\n`)

                // 发送结束标记
                res.write(`data: [DONE]\n\n`)
                res.end()
            } catch (e) {
                logger.error('流式响应处理错误', 'CHAT', '', e)
                res.status(500).json({ error: "服务错误!!!" })
            }
        })
    } catch (error) {
        logger.error('聊天处理错误', 'CHAT', '', error)
        res.status(500).json({ error: "服务错误!!!" })
    }
}

/**
 * 处理非流式响应
 * @param {object} res - Express 响应对象
 * @param {object} response - 上游响应数据
 * @param {boolean} enable_thinking - 是否启用思考模式
 * @param {boolean} enable_web_search - 是否启用网络搜索
 * @param {string} model - 模型名称
 * @param {object} requestBody - 原始请求体，用于提取prompt信息
 */
const handleNonStreamResponse = async (res, response, enable_thinking, enable_web_search, model, requestBody = null) => {
    try {
        // console.log(JSON.stringify(response))
        const content = response.data.choices[0].message.content

        // 提取prompt文本用于token估算
        let promptText = ''
        if (requestBody && requestBody.messages) {
            promptText = requestBody.messages.map(msg => {
                if (typeof msg.content === 'string') {
                    return msg.content
                } else if (Array.isArray(msg.content)) {
                    return msg.content.map(item => item.text || '').join('')
                }
                return ''
            }).join('\n')
        }

        // 尝试从上游响应中提取真实的usage数据
        let usage = response.usage || null

        // 计算token使用量
        if (!usage) {
            usage = createUsageObject(requestBody?.messages || promptText, content, null)
            logger.info(`非流式使用tiktoken计算 - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Total: ${usage.total_tokens}`, 'CHAT')
        } else {
            logger.info(`非流式使用上游真实Token - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Total: ${usage.total_tokens}`, 'CHAT')
        }

        // 确保token数量的有效性
        usage.prompt_tokens = Math.max(0, usage.prompt_tokens || 0)
        usage.completion_tokens = Math.max(0, usage.completion_tokens || 0)
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens

        const bodyTemplate = {
            "id": `chatcmpl-${generateUUID()}`,
            "object": "chat.completion",
            "created": new Date().getTime(),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": content
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": usage
        }
        res.json(bodyTemplate)
    } catch (error) {
        logger.error('非流式聊天处理错误', 'CHAT', '', error)
        res.status(500)
            .json({
                error: "服务错误!!!"
            })
    }
}


/**
 * 主要的聊天完成处理函数
 * @param {object} req - Express 请求对象
 * @param {object} res - Express 响应对象
 */
const handleChatCompletion = async (req, res) => {
    const { stream, model } = req.body

    const enable_thinking = req.enable_thinking
    const enable_web_search = req.enable_web_search

    try {
        const response_data = await sendChatRequest(req.body)

        if (!response_data.status || !response_data.response) {
            res.status(500)
                .json({
                    error: "请求发送失败！！！"
                })
            return
        }

        if (stream) {
            setResponseHeaders(res, true)
            await handleStreamResponse(res, response_data.response, enable_thinking, enable_web_search, req.body)
        } else {
            setResponseHeaders(res, false)
            await handleNonStreamResponse(res, response_data.response, enable_thinking, enable_web_search, model, req.body)
        }

    } catch (error) {
        logger.error('聊天处理错误', 'CHAT', '', error)
        res.status(500)
            .json({
                error: "token无效,请求发送失败！！！"
            })
    }
}

module.exports = {
    handleChatCompletion,
    handleStreamResponse,
    handleNonStreamResponse,
    setResponseHeaders
}
