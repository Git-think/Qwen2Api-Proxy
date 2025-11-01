const fs = require('fs')
const path = require('path')

/**
 * 日志管理器
 * 统一管理项目中的日志输出，支持分级打印、时间戳、Emoji标签等功能
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      // 日志级别: DEBUG < INFO < WARN < ERROR
      level: options.level || 'INFO',
      // 是否启用文件日志
      enableFileLog: options.enableFileLog || false,
      // 日志文件路径
      logDir: options.logDir || path.join(__dirname, '../../logs'),
      // 日志文件名格式
      logFileName: options.logFileName || 'app.log',
      // 是否显示时间戳
      showTimestamp: options.showTimestamp !== false,
      // 是否显示日志级别
      showLevel: options.showLevel !== false,
      // 是否显示模块名
      showModule: options.showModule !== false,
      // 时间格式
      timeFormat: options.timeFormat || 'YYYY-MM-DD HH:mm:ss',
      // 最大日志文件大小 (MB)
      maxFileSize: options.maxFileSize || 10,
      // 保留的日志文件数量
      maxFiles: options.maxFiles || 5
    }

    // 日志级别映射
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    }

    // Emoji 标签映射
    this.emojis = {
      DEBUG: '🔍',
      INFO: '📝',
      WARN: '⚠️',
      ERROR: '❌',
      SUCCESS: '✅',
      NETWORK: '🌐',
      DATABASE: '🗄️',
      AUTH: '🔐',
      UPLOAD: '📤',
      DOWNLOAD: '📥',
      CACHE: '💾',
      CONFIG: '⚙️',
      SERVER: '🚀',
      CLIENT: '👤',
      REDIS: '🔴',
      TOKEN: '🎫',
      SEARCH: '🔍',
      CHAT: '💬',
      MODEL: '🤖',
      FILE: '📁',
      TIME: '⏰',
      MEMORY: '🧠',
      PROCESS: '⚡'
    }

    // 颜色代码
    this.colors = {
      DEBUG: '\x1b[36m',    // 青色
      INFO: '\x1b[32m',     // 绿色
      WARN: '\x1b[33m',     // 黄色
      ERROR: '\x1b[31m',    // 红色
      RESET: '\x1b[0m',     // 重置
      BRIGHT: '\x1b[1m',    // 加粗
      DIM: '\x1b[2m'        // 暗淡
    }

    // 初始化日志目录
    if (this.options.enableFileLog) {
      this.initLogDirectory()
    }
  }

  /**
   * 初始化日志目录
   */
  initLogDirectory() {
    try {
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true })
      }
    } catch (error) {
      console.error('创建日志目录失败:', error.message)
    }
  }

  /**
   * 检查日志级别是否应该输出
   * @param {string} level - 日志级别
   * @returns {boolean}
   */
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.options.level]
  }

  /**
   * 格式化时间戳
   * @returns {string}
   */
  formatTimestamp() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {string} module - 模块名
   * @param {string} emoji - Emoji标签
   * @returns {Object} 格式化后的消息对象
   */
  formatMessage(level, message, module = '', emoji = '') {
    const timestamp = this.options.showTimestamp ? this.formatTimestamp() : ''
    const levelStr = this.options.showLevel ? `[${level}]` : ''
    const moduleStr = this.options.showModule && module ? `[${module}]` : ''
    const emojiStr = emoji || this.emojis[level] || ''
    
    // 控制台输出格式（带颜色）
    const consoleMessage = [
      this.colors.DIM + timestamp + this.colors.RESET,
      this.colors[level] + levelStr + this.colors.RESET,
      this.colors.BRIGHT + moduleStr + this.colors.RESET,
      emojiStr,
      message
    ].filter(Boolean).join(' ')

    // 文件输出格式（无颜色）
    const fileMessage = [
      timestamp,
      levelStr,
      moduleStr,
      emojiStr,
      message
    ].filter(Boolean).join(' ')

    return { consoleMessage, fileMessage }
  }

  /**
   * 写入日志文件
   * @param {string} message - 日志消息
   */
  writeToFile(message) {
    if (!this.options.enableFileLog) return

    try {
      const logFile = path.join(this.options.logDir, this.options.logFileName)
      const logEntry = `${message}\n`
      
      // 检查文件大小并轮转
      this.rotateLogFile(logFile)
      
      fs.appendFileSync(logFile, logEntry, 'utf8')
    } catch (error) {
      console.error('写入日志文件失败:', error.message)
    }
  }

  /**
   * 日志文件轮转
   * @param {string} logFile - 日志文件路径
   */
  rotateLogFile(logFile) {
    try {
      if (!fs.existsSync(logFile)) return

      const stats = fs.statSync(logFile)
      const fileSizeMB = stats.size / (1024 * 1024)

      if (fileSizeMB > this.options.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupFile = logFile.replace('.log', `_${timestamp}.log`)
        
        fs.renameSync(logFile, backupFile)
        
        // 清理旧的日志文件
        this.cleanOldLogFiles()
      }
    } catch (error) {
      console.error('日志文件轮转失败:', error.message)
    }
  }

  /**
   * 清理旧的日志文件
   */
  cleanOldLogFiles() {
    try {
      const files = fs.readdirSync(this.options.logDir)
      const logFiles = files
        .filter(file => file.endsWith('.log') && file !== this.options.logFileName)
        .map(file => ({
          name: file,
          path: path.join(this.options.logDir, file),
          mtime: fs.statSync(path.join(this.options.logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime)

      // 保留最新的几个文件，删除其余的
      if (logFiles.length > this.options.maxFiles) {
        const filesToDelete = logFiles.slice(this.options.maxFiles)
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path)
        })
      }
    } catch (error) {
      console.error('清理旧日志文件失败:', error.message)
    }
  }

  /**
   * 通用日志方法
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {string} module - 模块名
   * @param {string} emoji - Emoji标签
   * @param {any} data - 附加数据
   */
  log(level, message, module = '', emoji = '', data = null) {
    if (!this.shouldLog(level)) return

    const { consoleMessage, fileMessage } = this.formatMessage(level, message, module, emoji)
    
    // 控制台输出
    if (level === 'ERROR') {
      console.error(consoleMessage)
    } else if (level === 'WARN') {
      console.warn(consoleMessage)
    } else {
      console.log(consoleMessage)
    }

    // 输出附加数据
    if (data !== null) {
      console.log(data)
    }

    // 文件输出
    this.writeToFile(fileMessage + (data ? `\n${JSON.stringify(data, null, 2)}` : ''))
  }

  // 便捷方法
  debug(message, module = '', emoji = '', data = null) {
    this.log('DEBUG', message, module, emoji || this.emojis.DEBUG, data)
  }

  info(message, module = '', emoji = '', data = null) {
    this.log('INFO', message, module, emoji || this.emojis.INFO, data)
  }

  warn(message, module = '', emoji = '', data = null) {
    this.log('WARN', message, module, emoji || this.emojis.WARN, data)
  }

  error(message, module = '', emoji = '', data = null) {
    this.log('ERROR', message, module, emoji || this.emojis.ERROR, data)
  }

  // 特定场景的便捷方法
  success(message, module = '', data = null) {
    this.info(message, module, this.emojis.SUCCESS, data)
  }

  network(message, module = '', data = null) {
    this.info(message, module, this.emojis.NETWORK, data)
  }

  database(message, module = '', data = null) {
    this.info(message, module, this.emojis.DATABASE, data)
  }

  auth(message, module = '', data = null) {
    this.info(message, module, this.emojis.AUTH, data)
  }

  redis(message, module = '', data = null) {
    this.info(message, module, this.emojis.REDIS, data)
  }

  chat(message, module = '', data = null) {
    this.info(message, module, this.emojis.CHAT, data)
  }

  server(message, module = '', data = null) {
    this.info(message, module, this.emojis.SERVER, data)
  }
}

// 创建默认实例
const defaultLogger = new Logger({
  level: process.env.LOG_LEVEL || 'INFO',
  enableFileLog: process.env.ENABLE_FILE_LOG === 'true',
  showModule: true,
  showTimestamp: true,
  showLevel: true
})

module.exports = {
  Logger,
  logger: defaultLogger
}
