const { generateUUID } = require('../utils/tools.js')
const { isChatType, isThinkingEnabled, parserModel, parserMessages } = require('../utils/chat-helpers.js')
const { logger } = require('../utils/logger')

/**
 * 处理聊天请求体的中间件
 * 解析和转换请求参数为内部格式
 */
const processRequestBody = async (req, res, next) => {
  try {
    // 构建请求体
    const body = {
      "stream": true,
      "incremental_output": true,
      "chat_type": "t2t",
      "model": "qwen3-235b-a22b",
      "messages": [],
      "session_id": generateUUID(),
      "id": generateUUID(),
      "sub_chat_type": "t2t",
      "chat_mode": "normal"
    }

    // 获取请求体原始数据
    let {
      messages,            // 消息历史
      model,               // 模型
      stream,              // 流式输出
      enable_thinking,     // 是否启用思考
      thinking_budget,      // 思考预算
      size                  //图片尺寸
    } = req.body

    // 处理 stream 参数
    if (stream === true || stream === 'true') {
      body.stream = true
    } else {
      body.stream = false
    }
    
    // 处理 chat_type 参数 : 聊天类型
    body.chat_type = isChatType(model)

    req.enable_web_search = body.chat_type === 'search' ? true : false
    
    // 处理 model 参数 : 模型
    body.model = parserModel(model)
    
    // 处理 messages 参数 : 消息历史
    body.messages = await parserMessages(messages, isThinkingEnabled(model, enable_thinking, thinking_budget), body.chat_type)
    
    // 处理 enable_thinking 参数 : 是否启用思考
    req.enable_thinking = isThinkingEnabled(model, enable_thinking, thinking_budget).thinking_enabled
    
    // 处理 sub_chat_type 参数 : 子聊天类型
    body.sub_chat_type = body.chat_type

    // 处理图片尺寸
    if (size) {
      body.size = size
    }

    // 处理请求体,将body赋值给req.body
    req.body = body

    next()
  } catch (e) {
    logger.error('处理请求体时发生错误', 'MIDDLEWARE', '', e)
    res.status(500)
      .json({
        status: 500,
        message: "在处理请求体时发生错误 ~ ~ ~"
      })
  }
}

module.exports = {
  processRequestBody
}
