const axios = require('axios')
const { logger } = require('../utils/logger.js')
const { setResponseHeaders } = require('./chat.js')
const accountManager = require('../utils/account.js')
const { sleep } = require('../utils/tools.js')
const { generateChatID } = require('../utils/request.js')
const config = require('../config/index.js')

/**
 * 主要的聊天完成处理函数
 * @param {object} req - Express 请求对象
 * @param {object} res - Express 响应对象
 */
const handleImageVideoCompletion = async (req, res) => {
    const { model, messages, size, chat_type } = req.body
    // console.log(JSON.stringify(req.body.messages.filter(item => item.role == "user" || item.role == "assistant")))
    const token = accountManager.getAccountToken()

    try {

        // 请求体模板
        const reqBody = {
            "stream": false,
            "chat_id": null,
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": "",
                    "files": [],
                    "chat_type": chat_type,
                    "feature_config": {
                        "output_schema": "phase"
                    }
                }
            ]
        }

        const chat_id = await generateChatID(token,model)

        if (!chat_id) {
            // 如果生成chat_id失败，则返回错误
            throw new Error()
        } else {
            reqBody.chat_id = chat_id
        }

        // 拿到用户最后一句消息
        const _userPrompt = messages[messages.length - 1].content
        if (!_userPrompt) {
            throw new Error()
        }

        // 提取历史消息
        const messagesHistory = messages.filter(item => item.role == "user" || item.role == "assistant")
        // 聊天消息中所有图片url
        const select_image_list = []

        // 遍历模型回复消息，拿到所有图片
        if (chat_type == "image_edit") {
            for (const item of messagesHistory) {
                if (item.role == "assistant") {
                    // 使用matchAll提取所有图片链接
                    const matches = [...item.content.matchAll(/!\[image\]\((.*?)\)/g)]
                    // 将所有匹配到的图片url添加到图片列表
                    for (const match of matches) {
                        select_image_list.push(match[1])
                    }
                } else {
                    if (Array.isArray(item.content) && item.content.length > 0) {
                        for (const content of item.content) {
                            if (content.type == "image") {
                                select_image_list.push(content.image)
                            }
                        }
                    }
                }
            }
        }

        //分情况处理
        if (chat_type == 't2i' || chat_type == 't2v') {
            if (Array.isArray(_userPrompt)) {
                reqBody.messages[0].content = _userPrompt.map(item => item.type == "text" ? item.text : "").join("\n\n")
            } else {
                reqBody.messages[0].content = _userPrompt
            }
        } else if (chat_type == 'image_edit') {
            if (!Array.isArray(_userPrompt)) {

                if (messagesHistory.length === 1) {
                    reqBody.messages[0].chat_type = "t2i"
                } else if (select_image_list.length >= 1) {
                    reqBody.messages[0].files.push({
                        "type": "image",
                        "url": select_image_list[select_image_list.length - 1]
                    })
                }
                reqBody.messages[0].content += _userPrompt
            } else {
                const texts = _userPrompt.filter(item => item.type == "text")
                if (texts.length === 0) {
                    throw new Error()
                }
                // 拼接提示词
                for (const item of texts) {
                    reqBody.messages[0].content += item.text
                }

                const files = _userPrompt.filter(item => item.type == "image")
                // 如果图片为空，则设置为t2i
                if (files.length === 0) {
                    reqBody.messages[0].chat_type = "t2i"
                }
                // 遍历图片
                for (const item of files) {
                    reqBody.messages[0].files.push({
                        "type": "image",
                        "url": item.image
                    })
                }

            }
        }


        // 处理图片视频尺寸
        if (chat_type == 't2i' || chat_type == 't2v') {
            // 获取图片尺寸，优先级 参数 > 提示词 > 默认
            if (size != undefined && size != null) {
                reqBody.size = "1:1"
            } else if (_userPrompt.indexOf("@4:3") != -1) {
                reqBody.size = "4:3"//"1024*768"
            } else if (_userPrompt.indexOf("@3:4") != -1) {
                reqBody.size = "3:4"//"768*1024"
            } else if (_userPrompt.indexOf("@16:9") != -1) {
                reqBody.size = "16:9"//"1280*720"
            } else if (_userPrompt.indexOf("@9:16") != -1) {
                reqBody.size = "9:16"//"720*1280"
            }
        }

        logger.info('发送图片视频请求', 'CHAT')
        logger.info(`选择图片: ${select_image_list[select_image_list.length - 1] || "未选择图片，切换生成图/视频模式"}`, 'CHAT')
        logger.info(`使用提示: ${reqBody.messages[0].content}`, 'CHAT')
        // console.log(JSON.stringify(reqBody))
        const newChatType = reqBody.messages[0].chat_type
        const response_data = await axios.post(`https://chat.qwen.ai/api/v2/chat/completions?chat_id=${chat_id}`, reqBody, {
            headers: {
                "Authorization": `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...(config.ssxmodItna && { 'Cookie': `ssxmod_itna=${config.ssxmodItna};ssxmod_itna2=${config.ssxmodItna2}` })
            },
            responseType: newChatType == 't2i' ? 'stream' : 'json',
            timeout: 1000 * 60 * 5
        })

        try {
            let contentUrl = null
            if (newChatType == 't2i') {
                const decoder = new TextDecoder('utf-8')
                response_data.data.on('data', async (chunk) => {
                    const data = decoder.decode(chunk, { stream: true }).split('\n').filter(item => item.trim() != "")
                    for (const item of data) {
                        const jsonObj = JSON.parse(item.replace("data:", '').trim())
                        if (jsonObj && jsonObj.choices && jsonObj.choices[0] && jsonObj.choices[0].delta && jsonObj.choices[0].delta.content.trim() != "" && contentUrl == null) {
                            contentUrl = jsonObj.choices[0].delta.content
                        }
                    }
                })

                response_data.data.on('end', () => {
                    return returnResponse(res, model, contentUrl, req.body.stream)
                })
            } else if (newChatType == 'image_edit') {
                contentUrl = response_data.data?.data?.choices[0]?.message?.content[0]?.image
                return returnResponse(res, model, contentUrl, req.body.stream)
            } else if (newChatType == 't2v') {
                return handleVideoCompletion(req, res, response_data.data, token)
            }

        } catch (error) {
            logger.error('图片处理错误', 'CHAT', error)
            res.status(500).json({ error: "服务错误!!!" })
        }

    } catch (error) {
        res.status(500).json({
            error: "服务错误，请稍后再试"
        })
    }
}

/**
 * 返回响应
 * @param {*} res 
 * @param {*} model 
 * @param {*} contentUrl 
 */
const returnResponse = (res, model, contentUrl, stream) => {
    setResponseHeaders(res, stream)
    logger.info(`返回响应: ${contentUrl}`, 'CHAT')

    const returnBody = {
        "created": new Date().getTime(),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": `![image](${contentUrl})`
                }
            }
        ]
    }

    if (stream) {
        res.write(`data: ${JSON.stringify(returnBody)}\n\n`)
        res.write(`data: [DONE]\n\n`)
        res.end()
    } else {
        res.json(returnBody)
    }
}

const handleVideoCompletion = async (req, res, response_data, token) => {
    try {
        const videoTaskID = response_data?.data?.messages[0]?.extra?.wanx?.task_id
        if (!response_data || !response_data.success || !videoTaskID) {
            throw new Error()
        }

        logger.info(`视频任务ID: ${videoTaskID}`, 'CHAT')
        const returnBody = {
            "id": `chatcmpl-${new Date().getTime()}`,
            "object": "chat.completion.chunk",
            "created": new Date().getTime(),
            "model": response_data.data.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": ""
                    },
                    "finish_reason": null
                }
            ]
        }

        // 设置尝试次数
        const maxAttempts = 60
        // 设置每次请求的间隔时间
        const delay = 20 * 1000
        // 循环尝试获取任务状态
        for (let i = 0; i < maxAttempts; i++) {
            const content = await getVideoTaskStatus(videoTaskID, token)
            if (content) {
                returnBody.choices[0].message.content = `
<video controls = "controls">
${content}
</video>

[Download Video](${content})
`
                // 设置响应头
                setResponseHeaders(res, req.body.stream)

                if (req.body.stream) {
                    res.write(`data: ${JSON.stringify(returnBody)}\n\n`)
                    res.write(`data: [DONE]\n\n`)
                    res.end()
                } else {
                    res.json(returnBody)
                }
                return
            } else if (content == null && req.body.stream) {
                // 发送空数据保活
                res.write(`data: ${JSON.stringify(returnBody)}\n\n`)
            }

            await sleep(delay)
        }
    } catch (error) {
        logger.error('获取视频任务状态失败', 'CHAT', error)
        res.status(500).json({ error: error.response_data?.data?.code || "可能该帐号今日生成次数已用完" })
    }
}

const getVideoTaskStatus = async (videoTaskID, token) => {
    try {
        const response_data = await axios.get(`https://chat.qwen.ai/api/v1/tasks/status/${videoTaskID}`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...(config.ssxmodItna && { 'Cookie': `ssxmod_itna=${config.ssxmodItna};ssxmod_itna2=${config.ssxmodItna2}` })
            }
        })

        if (response_data.data?.task_status == "success") {
            logger.info('获取视频任务状态成功', 'CHAT', response_data.data?.content)
            return response_data.data?.content
        }
        logger.info(`获取视频任务 ${videoTaskID} 状态: ${response_data.data?.task_status}`, 'CHAT')
        return null
    } catch (error) {
        console.log(error.response.data)
        return null
    }
}

module.exports = {
    handleImageVideoCompletion
}