const accountManager = require('./account')
const { logger } = require('./logger')

/**
 * 账户设置工具
 * 提供账户的保存和删除功能，使用统一的账户管理器
 */

/**
 * 保存账户信息
 * @param {string} email - 邮箱地址
 * @param {string} password - 密码
 * @param {string} token - 访问令牌
 * @param {number} expires - 过期时间戳
 * @returns {Promise<boolean>} 保存是否成功
 */
const saveAccounts = async (email, password, token, expires) => {
  try {
    // 参数验证
    if (!email || !password) {
      logger.error('保存账户失败: 邮箱和密码不能为空', 'SETTING')
      return false
    }

    // 使用账户管理器的统一方法
    const success = await accountManager.addAccount(email, password)

    if (success) {
      logger.success(`账户 ${email} 保存成功`, 'SETTING')
      return true
    } else {
      logger.error(`账户 ${email} 保存失败`, 'SETTING')
      return false
    }
  } catch (error) {
    logger.error(`保存账户 ${email} 时发生错误`, 'SETTING', '', error)
    return false
  }
}

/**
 * 删除账户
 * @param {string} email - 邮箱地址
 * @returns {Promise<boolean>} 删除是否成功
 */
const deleteAccount = async (email) => {
  try {
    // 参数验证
    if (!email) {
      logger.error('删除账户失败: 邮箱不能为空', 'SETTING')
      return false
    }

    // 使用账户管理器的统一方法
    const success = await accountManager.removeAccount(email)

    if (success) {
      logger.success(`账户 ${email} 删除成功`, 'SETTING')
      return true
    } else {
      logger.error(`账户 ${email} 删除失败`, 'SETTING')
      return false
    }
  } catch (error) {
    logger.error(`删除账户 ${email} 时发生错误`, 'SETTING', '', error)
    return false
  }
}

/**
 * 获取所有账户信息
 * @returns {Array} 账户列表
 */
const getAllAccounts = () => {
  try {
    return accountManager.getAllAccountKeys()
  } catch (error) {
    logger.error('获取账户列表时发生错误', 'SETTING', '', error)
    return []
  }
}

/**
 * 获取账户健康状态
 * @returns {Object} 健康状态统计
 */
const getAccountHealth = () => {
  try {
    return accountManager.getHealthStats()
  } catch (error) {
    logger.error('获取账户健康状态时发生错误', 'SETTING', '', error)
    return {
      accounts: { total: 0, valid: 0, expired: 0, expiringSoon: 0, invalid: 0 },
      rotation: { total: 0, available: 0, inCooldown: 0 },
      initialized: false
    }
  }
}

/**
 * 手动刷新账户令牌
 * @param {string} email - 邮箱地址
 * @returns {Promise<boolean>} 刷新是否成功
 */
const refreshAccountToken = async (email) => {
  try {
    if (!email) {
      logger.error('刷新令牌失败: 邮箱不能为空', 'SETTING')
      return false
    }

    const success = await accountManager.refreshAccountToken(email)

    if (success) {
      logger.success(`账户 ${email} 令牌刷新成功`, 'SETTING')
      return true
    } else {
      logger.error(`账户 ${email} 令牌刷新失败`, 'SETTING')
      return false
    }
  } catch (error) {
    logger.error(`刷新账户 ${email} 令牌时发生错误`, 'SETTING', '', error)
    return false
  }
}

module.exports = {
  saveAccounts,
  deleteAccount,
  getAllAccounts,
  getAccountHealth,
  refreshAccountToken
}