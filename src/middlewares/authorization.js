const config = require('../config')

/**
 * 验证API Key是否有效
 * @param {string} providedKey - 提供的API Key
 * @returns {Object} 验证结果 { isValid: boolean, isAdmin: boolean }
 */
const validateApiKey = (providedKey) => {
  if (!providedKey) {
    return { isValid: false, isAdmin: false }
  }

  // 移除Bearer前缀
  const cleanKey = providedKey.startsWith('Bearer ') ? providedKey.slice(7) : providedKey

  // 检查是否在有效的API keys列表中
  const isValid = config.apiKeys.includes(cleanKey)
  const isAdmin = cleanKey === config.adminKey

  return { isValid, isAdmin }
}

/**
 * API Key验证中间件 - 验证任何有效的API Key
 */
const apiKeyVerify = (req, res, next) => {
  const apiKey = req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-api-key']
  const { isValid, isAdmin } = validateApiKey(apiKey)

  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // 将权限信息附加到请求对象
  req.isAdmin = isAdmin
  req.apiKey = apiKey
  next()
}

/**
 * 管理员权限验证中间件 - 只允许管理员API Key
 */
const adminKeyVerify = (req, res, next) => {
  const apiKey = req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-api-key']
  const { isValid, isAdmin } = validateApiKey(apiKey)

  if (!isValid || !isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  req.isAdmin = isAdmin
  req.apiKey = apiKey
  next()
}

module.exports = {
  apiKeyVerify,
  adminKeyVerify,
  validateApiKey
}

