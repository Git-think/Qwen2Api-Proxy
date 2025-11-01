const express = require('express')
const router = express.Router()
const config = require('../config')
const { apiKeyVerify, adminKeyVerify } = require('../middlewares/authorization')
const { logger } = require('../utils/logger')


router.get('/settings', adminKeyVerify, async (req, res) => {
  // 分离管理员密钥和普通密钥
  const regularKeys = config.apiKeys.filter(key => key !== config.adminKey)

  res.json({
    apiKey: config.apiKey, // 保持向后兼容
    adminKey: config.adminKey,
    regularKeys: regularKeys,
    defaultHeaders: config.defaultHeaders,
    defaultCookie: config.defaultCookie,
    autoRefresh: config.autoRefresh,
    autoRefreshInterval: config.autoRefreshInterval,
    outThink: config.outThink,
    searchInfoMode: config.searchInfoMode,
    simpleModelMap: config.simpleModelMap
  })
})

// 添加普通API Key
router.post('/addRegularKey', adminKeyVerify, async (req, res) => {
  try {
    const { apiKey } = req.body
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key不能为空' })
    }

    // 检查是否已存在
    if (config.apiKeys.includes(apiKey)) {
      return res.status(409).json({ error: 'API Key已存在' })
    }

    // 添加到配置中
    config.apiKeys.push(apiKey)

    res.json({ message: 'API Key添加成功' })
  } catch (error) {
    logger.error('添加API Key失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 删除普通API Key
router.post('/deleteRegularKey', adminKeyVerify, async (req, res) => {
  try {
    const { apiKey } = req.body
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key不能为空' })
    }

    // 不能删除管理员密钥
    if (apiKey === config.adminKey) {
      return res.status(403).json({ error: '不能删除管理员密钥' })
    }

    // 从配置中移除
    const index = config.apiKeys.indexOf(apiKey)
    if (index === -1) {
      return res.status(404).json({ error: 'API Key不存在' })
    }

    config.apiKeys.splice(index, 1)

    res.json({ message: 'API Key删除成功' })
  } catch (error) {
    logger.error('删除API Key失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新自动刷新设置
router.post('/setAutoRefresh', adminKeyVerify, async (req, res) => {
  try {
    const { autoRefresh, autoRefreshInterval } = req.body

    if (typeof autoRefresh !== 'boolean') {
      return res.status(400).json({ error: '无效的自动刷新设置' })
    }

    if (autoRefreshInterval !== undefined) {
      const interval = parseInt(autoRefreshInterval)
      if (isNaN(interval) || interval < 0) {
        return res.status(400).json({ error: '无效的自动刷新间隔' })
      }
    }
    config.autoRefresh = autoRefresh
    config.autoRefreshInterval = autoRefreshInterval || 6 * 60 * 60
    res.json({
      status: true,
      message: '自动刷新设置更新成功'
    })
  } catch (error) {
    logger.error('更新自动刷新设置失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新思考输出设置
router.post('/setOutThink', adminKeyVerify, async (req, res) => {
  try {
    const { outThink } = req.body;
    if (typeof outThink !== 'boolean') {
      return res.status(400).json({ error: '无效的思考输出设置' })
    }

    config.outThink = outThink
    res.json({
      status: true,
      message: '思考输出设置更新成功'
    })
  } catch (error) {
    logger.error('更新思考输出设置失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新搜索信息模式
router.post('/search-info-mode', adminKeyVerify, async (req, res) => {
  try {
    const { searchInfoMode } = req.body
    if (!['table', 'text'].includes(searchInfoMode)) {
      return res.status(400).json({ error: '无效的搜索信息模式' })
    }

    config.searchInfoMode = searchInfoMode
    res.json({
      status: true,
      message: '搜索信息模式更新成功'
    })
  } catch (error) {
    logger.error('更新搜索信息模式失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新简化模型映射设置
router.post('/simple-model-map', adminKeyVerify, async (req, res) => {
  try {
    const { simpleModelMap } = req.body
    if (typeof simpleModelMap !== 'boolean') {
      return res.status(400).json({ error: '无效的简化模型映射设置' })
    }

    config.simpleModelMap = simpleModelMap
    res.json({
      status: true,
      message: '简化模型映射设置更新成功'
    })
  } catch (error) {
    logger.error('更新简化模型映射设置失败', 'CONFIG', '', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router