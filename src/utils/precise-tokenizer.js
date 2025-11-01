/**
 * 精准Token统计工具
 * 使用tiktoken进行准确的token计数
 */

const tiktoken = require('tiktoken')

/**
 * 使用tiktoken进行精准token计数
 * @param {string} text - 要计数的文本
 * @param {string} model - 模型名称，默认为gpt-3.5-turbo
 * @returns {number} 精确的token数量
 */
function countTokens(text, model = 'gpt-3.5-turbo') {
  if (!text || typeof text !== 'string') return 0

  const encoding = tiktoken.encoding_for_model(model)
  const tokens = encoding.encode(text)
  encoding.free() // 释放内存
  return tokens.length
}



/**
 * 计算消息数组的token数量
 * @param {Array} messages - 消息数组
 * @param {string} model - 模型名称
 * @returns {number} 总token数量
 */
function countMessagesTokens(messages, model = 'gpt-3.5-turbo') {
  if (!Array.isArray(messages)) return 0

  let totalTokens = 0

  // 每条消息的基础开销（根据OpenAI文档）
  const messageOverhead = 4 // 每条消息约4个token的格式开销

  for (const message of messages) {
    totalTokens += messageOverhead

    // 角色token
    if (message.role) {
      totalTokens += countTokens(message.role, model)
    }

    // 内容token
    if (typeof message.content === 'string') {
      totalTokens += countTokens(message.content, model)
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.text) {
          totalTokens += countTokens(item.text, model)
        }
      }
    }

    // 函数调用等其他字段的token计算
    if (message.function_call) {
      totalTokens += countTokens(JSON.stringify(message.function_call), model)
    }
  }

  // 对话的额外开销
  totalTokens += 2 // 对话开始和结束的token

  return totalTokens
}

/**
 * 创建精准的usage对象
 * @param {Array|string} promptMessages - 提示消息或文本
 * @param {string} completionText - 完成文本
 * @param {object} realUsage - 真实的usage数据（如果有）
 * @param {string} model - 模型名称
 * @returns {object} usage对象
 */
function createUsageObject(promptMessages, completionText = '', realUsage = null, model = 'gpt-3.5-turbo') {
  // 如果有真实的usage数据，优先使用
  if (realUsage && realUsage.prompt_tokens && realUsage.completion_tokens) {
    return {
      prompt_tokens: realUsage.prompt_tokens,
      completion_tokens: realUsage.completion_tokens,
      total_tokens: realUsage.total_tokens || (realUsage.prompt_tokens + realUsage.completion_tokens)
    }
  }

  // 计算prompt tokens
  let promptTokens = 0
  if (Array.isArray(promptMessages)) {
    promptTokens = countMessagesTokens(promptMessages, model)
  } else if (typeof promptMessages === 'string') {
    promptTokens = countTokens(promptMessages, model)
  }

  // 计算completion tokens
  const completionTokens = countTokens(completionText, model)

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  }
}

module.exports = {
  countTokens,
  countMessagesTokens,
  createUsageObject
}
