const fs = require('fs').promises
const path = require('path')
const config = require('../config/index.js')
const redisClient = require('./redis')
const { logger } = require('./logger')

/**
 * 数据持久化管理器
 * 统一处理账户数据的存储和读取
 */
class DataPersistence {
  constructor() {
    this.dataFilePath = path.join(__dirname, '../../data/data.json')
  }

  /**
   * 加载所有账户数据
   * @returns {Promise<Array>} 账户列表
   */
  async loadAccounts() {
    try {
      switch (config.dataSaveMode) {
        case 'redis':
          return await this._loadFromRedis()
        case 'file':
          return await this._loadFromFile()
        case 'none':
          return await this._loadFromEnv()
        default:
          logger.error(`不支持的数据保存模式: ${config.dataSaveMode}`, 'DATA')
          throw new Error(`不支持的数据保存模式: ${config.dataSaveMode}`)
      }
    } catch (error) {
      logger.error('加载账户数据失败', 'DATA', '', error)
      return []
    }
  }

  /**
   * 保存单个账户数据
   * @param {string} email - 邮箱
   * @param {Object} accountData - 账户数据
   * @returns {Promise<boolean>} 保存是否成功
   */
  async saveAccount(email, accountData) {
    try {
      switch (config.dataSaveMode) {
        case 'redis':
          return await this._saveToRedis(email, accountData)
        case 'file':
          return await this._saveToFile(email, accountData)
        case 'none':
          logger.warn('环境变量模式不支持保存账户数据', 'DATA')
          return false
        default:
          logger.error(`不支持的数据保存模式: ${config.dataSaveMode}`, 'DATA')
          throw new Error(`不支持的数据保存模式: ${config.dataSaveMode}`)
      }
    } catch (error) {
      logger.error(`保存账户数据失败 (${email})`, 'DATA', '', error)
      return false
    }
  }

  /**
   * 批量保存账户数据
   * @param {Array} accounts - 账户列表
   * @returns {Promise<boolean>} 保存是否成功
   */
  async saveAllAccounts(accounts) {
    try {
      switch (config.dataSaveMode) {
        case 'redis':
          return await this._saveAllToRedis(accounts)
        case 'file':
          return await this._saveAllToFile(accounts)
        case 'none':
          logger.warn('环境变量模式不支持保存账户数据', 'DATA')
          return false
        default:
          logger.error(`不支持的数据保存模式: ${config.dataSaveMode}`, 'DATA')
          throw new Error(`不支持的数据保存模式: ${config.dataSaveMode}`)
      }
    } catch (error) {
      logger.error('批量保存账户数据失败', 'DATA', '', error)
      return false
    }
  }

  /**
   * 从 Redis 加载账户数据
   * @private
   */
  async _loadFromRedis() {
    const accounts = await redisClient.getAllAccounts()
    return accounts.length > 0 ? accounts : []
  }

  /**
   * 从文件加载账户数据
   * @private
   */
  async _loadFromFile() {
    // 确保文件存在
    await this._ensureDataFileExists()
    
    const fileContent = await fs.readFile(this.dataFilePath, 'utf-8')
    const data = JSON.parse(fileContent)
    
    return data.accounts || []
  }

  /**
   * 从环境变量加载账户数据
   * @private
   */
  async _loadFromEnv() {
    if (!process.env.ACCOUNTS) {
      return []
    }

    const { JwtDecode } = require('./tools')
    const accountTokens = process.env.ACCOUNTS.split(',')
    const accounts = []

    for (const item of accountTokens) {
      const [email, password] = item.split(':')
      if (email && password) {
        // 注意：这里需要登录获取token，但在加载阶段不应该进行网络请求
        // 这个逻辑需要在Account类中处理
        accounts.push({ email, password, token: null, expires: null })
      }
    }

    return accounts
  }

  /**
   * 保存到 Redis
   * @private
   */
  async _saveToRedis(email, accountData) {
    return await redisClient.setAccount(email, accountData)
  }

  /**
   * 保存到文件
   * @private
   */
  async _saveToFile(email, accountData) {
    await this._ensureDataFileExists()
    
    const fileContent = await fs.readFile(this.dataFilePath, 'utf-8')
    const data = JSON.parse(fileContent)
    
    if (!data.accounts) {
      data.accounts = []
    }

    // 查找现有账户或添加新账户
    const existingIndex = data.accounts.findIndex(account => account.email === email)
    const updatedAccount = {
      email,
      password: accountData.password,
      token: accountData.token,
      expires: accountData.expires
    }

    if (existingIndex !== -1) {
      data.accounts[existingIndex] = updatedAccount
    } else {
      data.accounts.push(updatedAccount)
    }

    await fs.writeFile(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  }

  /**
   * 保存代理绑定到文件
   * @private
   */
  async _saveProxyBindingToFile(email, proxyUrl) {
    await this._ensureDataFileExists()
    
    const fileContent = await fs.readFile(this.dataFilePath, 'utf-8')
    const data = JSON.parse(fileContent)

    if (!data.proxyBindings) {
      data.proxyBindings = {}
    }

    data.proxyBindings[email] = proxyUrl

    await fs.writeFile(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  }

  /**
   * 批量保存到 Redis
   * @private
   */
  async _saveAllToRedis(accounts) {
    let successCount = 0
    for (const account of accounts) {
      const success = await this._saveToRedis(account.email, account)
      if (success) successCount++
    }
    return successCount === accounts.length
  }

  /**
   * 批量保存到文件
   * @private
   */
  async _saveAllToFile(accounts) {
    await this._ensureDataFileExists()
    
    const fileContent = await fs.readFile(this.dataFilePath, 'utf-8')
    const data = JSON.parse(fileContent)
    
    data.accounts = accounts.map(account => ({
      email: account.email,
      password: account.password,
      token: account.token,
      expires: account.expires
    }))

    await fs.writeFile(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  }

  /**
   * 确保数据文件存在
   * @private
   */
  async _ensureDataFileExists() {
    try {
      await fs.access(this.dataFilePath)
    } catch (error) {
      logger.info('数据文件不存在，正在创建默认文件...', 'FILE', '📁')

      // 确保目录存在
      const dirPath = path.dirname(this.dataFilePath)
      await fs.mkdir(dirPath, { recursive: true })

      // 创建默认数据结构
      const defaultData = {
        defaultHeaders: null,
        defaultCookie: null,
        accounts: []
      }

      await fs.writeFile(this.dataFilePath, JSON.stringify(defaultData, null, 2), 'utf-8')
      logger.success('默认数据文件创建成功', 'FILE')
    }
  }
}

// 添加加载和保存代理绑定的方法
DataPersistence.prototype.loadProxyBindings = async function() {
  try {
    switch (config.dataSaveMode) {
      case 'redis':
        // redisClient 已经有 getAllProxyBindings 方法
        if (redisClient && typeof redisClient.getAllProxyBindings === 'function') {
          return await redisClient.getAllProxyBindings();
        } else {
          logger.error('Redis 客户端未初始化或缺少 getAllProxyBindings 方法', 'DATA');
          return {};
        }
      case 'file':
        return await this._loadProxyBindingsFromFile();
      case 'none':
        // 在 'none' 模式下，没有持久化绑定，返回空对象
        return {};
      default:
        logger.error(`不支持的数据保存模式: ${config.dataSaveMode}`, 'DATA');
        return {};
    }
  } catch (error) {
    logger.error('加载代理绑定失败', 'DATA', '', error);
    return {};
  }
};

DataPersistence.prototype._loadProxyBindingsFromFile = async function() {
  try {
    await this._ensureDataFileExists();

    const fileContent = await fs.readFile(this.dataFilePath, 'utf-8');
    const data = JSON.parse(fileContent);

    return data.proxyBindings || {};
  } catch (error) {
    logger.error('从文件加载代理绑定失败', 'DATA', '', error);
    return {};
  }
};

DataPersistence.prototype.saveProxyBinding = async function(email, proxyUrl) {
  try {
    switch (config.dataSaveMode) {
      case 'redis':
        // redisClient 已经有 setProxyBinding 方法
        if (redisClient && typeof redisClient.setProxyBinding === 'function') {
          return await redisClient.setProxyBinding(email, proxyUrl);
        } else {
          logger.error('Redis 客户端未初始化或缺少 setProxyBinding 方法', 'DATA');
          return false;
        }
      case 'file':
        return await this._saveProxyBindingToFile(email, proxyUrl);
      case 'none':
        // 在 'none' 模式下，不保存
        logger.info(`环境变量模式下，为 ${email} 分配代理 ${proxyUrl} (不持久化)`, 'DATA');
        return true;
      default:
        logger.error(`不支持的数据保存模式: ${config.dataSaveMode}`, 'DATA');
        return false;
    }
  } catch (error) {
    logger.error(`保存代理绑定失败 (${email} -> ${proxyUrl})`, 'DATA', '', error);
    return false;
  }
};

module.exports = DataPersistence
