const express = require('express')
const bodyParser = require('body-parser')
const loadConfig = require('./config/index.js')
const cors = require('cors')
const { logger } = require('./utils/logger')
const app = express()
const path = require('path')
const fs = require('fs')
const modelsRouter = require('./routes/models.js')
const chatRouter = require('./routes/chat.js')
const cliChatRouter = require('./routes/cli.chat.js')
const verifyRouter = require('./routes/verify.js')
const accountsRouter = require('./routes/accounts.js')
const settingsRouter = require('./routes/settings.js')
const TokenManager = require('./utils/token-manager');
const DataPersistence = require('./utils/data-persistence');

let config;

app.use(bodyParser.json({ limit: '128mb' }))
app.use(bodyParser.urlencoded({ limit: '128mb', extended: true }))
app.use(cors())

// API路由
app.use(modelsRouter)
app.use(chatRouter)
app.use(cliChatRouter)
app.use(verifyRouter)
app.use('/api', accountsRouter)
app.use('/api', settingsRouter)

app.use(express.static(path.join(__dirname, '../public/dist')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dist/index.html'), (err) => {
    if (err) {
      logger.error('管理页面加载失败', 'SERVER', '', err)
      res.status(500).send('服务器内部错误')
    }
  })
})

// 处理错误中间件（必须放在所有路由之后）
app.use((err, req, res, next) => {
  logger.error('服务器内部错误', 'SERVER', '', err)
  res.status(500).send('服务器内部错误')
})

async function startServer() {
    config = await loadConfig();
    // 服务器启动信息
    const serverInfo = {
      address: config.listenAddress || 'localhost',
      port: config.listenPort,
      outThink: config.outThink ? '开启' : '关闭',
      searchInfoMode: config.searchInfoMode === 'table' ? '表格' : '文本',
      dataSaveMode: config.dataSaveMode,
      logLevel: config.logLevel,
      enableFileLog: config.enableFileLog
    }

    if (config.listenAddress) {
      app.listen(config.listenPort, config.listenAddress, () => {
        logger.server('服务器启动成功', 'SERVER', serverInfo)
      })
    } else {
      app.listen(config.listenPort, () => {
        logger.server('服务器启动成功', 'SERVER', serverInfo)
      })
    }
}

module.exports = { startServer };