const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const config = require('../config/index.js');
const { logger } = require('./logger');

class ProxyManager {
  constructor() {
    // 从配置加载代理列表
    this.allProxies = config.socks5Proxies.map(proxyUrl => ({
      url: proxyUrl,
      available: false, // 初始状态为不可用，需测试后更新
      lastTested: null,
      failures: 0,
    }));
    this.availableProxies = []; // 存储当前可用的代理
    this.proxyAssignment = new Map(); // 存储账户邮箱到代理URL的映射 (持久化绑定)
    this.currentProxyIndex = 0; // 用于轮询分配
  }

  /**
   * 初始化代理：加载、格式化、测试可用性
   */
  async initialize() {
    logger.info(`开始初始化 ${this.allProxies.length} 个 SOCKS5 代理...`, 'PROXY');
    await this.testAllProxies();
    logger.success(`代理初始化完成，可用代理数: ${this.availableProxies.length}`, 'PROXY');
  }

  /**
   * 测试单个代理的可用性
   * @param {string} proxyUrl - 代理地址
   * @returns {Promise<boolean>} 代理是否可用
   */
  async testProxy(proxyUrl) {
    const timeout = 10000; // 10秒超时
    try {
      // 创建一个测试请求的 Agent
      const agent = new SocksProxyAgent(proxyUrl);

      // 尝试访问一个可靠的、快速响应的网站来测试代理
      const response = await axios.get('https://www.google.com/generate_204', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: timeout,
        validateStatus: (status) => status === 204, // 期望 204 No Content
      });

      logger.info(`代理 ${proxyUrl} 测试成功`, 'PROXY');
      return true;
    } catch (error) {
      logger.error(`代理 ${proxyUrl} 测试失败: ${error.message}`, 'PROXY');
      return false;
    }
  }

  /**
   * 测试所有代理的可用性
   */
  async testAllProxies() {
    const results = await Promise.allSettled(
      this.allProxies.map(async (proxyObj) => {
        const isAvailable = await this.testProxy(proxyObj.url);
        proxyObj.available = isAvailable;
        proxyObj.lastTested = new Date();
        if (isAvailable) {
          this.availableProxies.push(proxyObj.url);
        } else {
          // 如果代理不可用，检查是否有账户绑定了它
          for (let [email, assignedProxy] of this.proxyAssignment.entries()) {
            if (assignedProxy === proxyObj.url) {
              // 从可用列表中移除，触发后续重新分配
              this.availableProxies = this.availableProxies.filter(p => p !== assignedProxy);
              logger.warn(`代理 ${assignedProxy} 失效，与账户 ${email} 的绑定将被解除`, 'PROXY');
            }
          }
        }
      })
    );

    // 过滤出可用代理
    this.availableProxies = this.allProxies.filter(p => p.available).map(p => p.url);
  }

  /**
   * 为账户分配一个可用的代理
   * @param {string} email - 账户邮箱
   * @param {boolean} forceNew - 是否强制分配一个新的代理
   * @returns {string|null} 分配的代理URL或null
   */
  assignProxy(email, forceNew = false) {
    if (this.availableProxies.length === 0) {
      logger.warn(`没有可用的代理供账户 ${email} 使用`, 'PROXY');
      return null;
    }

    // 检查是否已有持久化绑定
    let assignedProxy = this.proxyAssignment.get(email);
    if (assignedProxy && !forceNew) {
      // 检查绑定的代理是否仍然可用
      if (this.availableProxies.includes(assignedProxy)) {
        logger.info(`账户 ${email} 使用已绑定的代理: ${assignedProxy}`, 'PROXY');
        return assignedProxy;
      } else {
        // 绑定的代理已不可用，需要重新分配
        logger.warn(`账户 ${email} 的原绑定代理 ${assignedProxy} 不可用，正在重新分配...`, 'PROXY');
        this.proxyAssignment.delete(email); // 删除旧绑定
      }
    }

    // 如果没有绑定或强制分配新代理，则进行轮询分配
    if (this.availableProxies.length > 0) {
      const proxy = this.availableProxies[this.currentProxyIndex];
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.availableProxies.length; // 轮询

      this.proxyAssignment.set(email, proxy);
      logger.info(`为账户 ${email} 分配代理: ${proxy}`, 'PROXY');
      return proxy;
    }

    return null;
  }

  /**
   * 获取当前分配给账户的代理
   * @param {string} email - 账户邮箱
   * @returns {string|null} 代理URL或null
   */
  getAssignedProxy(email) {
    return this.proxyAssignment.get(email) || null;
  }

  /**
   * 获取所有可用代理的数量
   * @returns {number} 可用代理数
   */
  getAvailableProxyCount() {
    return this.availableProxies.length;
  }

  /**
   * 标记一个代理为失效，并从可用列表中移除
   * @param {string} proxyUrl - 失效的代理URL
   */
  markProxyAsFailed(proxyUrl) {
    logger.warn(`标记代理 ${proxyUrl} 为失效`, 'PROXY');
    // 从可用列表中移除
    this.availableProxies = this.availableProxies.filter(p => p !== proxyUrl);
    // 查找并解除绑定此代理的所有账户
    for (let [email, assignedProxy] of this.proxyAssignment.entries()) {
      if (assignedProxy === proxyUrl) {
        this.proxyAssignment.delete(email);
        try {
            const proxyUrlObj = new URL(proxyUrl);
            logger.info(`解除账户 ${email} (${proxyUrlObj.hostname}) 与失效代理的绑定`, 'PROXY');
        } catch (e) {
            logger.info(`解除账户 ${email} (无法解析IP) 与失效代理的绑定 (代理: ${proxyUrl})`, 'PROXY');
        }
      }
    }
  }

  /**
   * 获取所有代理的状态信息
   * @returns {Array} 代理状态数组
   */
  getProxyStatus() {
    return this.allProxies.map(proxy => ({
      url: proxy.url,
      available: proxy.available,
      lastTested: proxy.lastTested,
      failures: proxy.failures,
    }));
  }

  /**
   * 获取持久化绑定关系
   * @returns {Map} 账户到代理的映射
   */
  getProxyAssignments() {
    return new Map(this.proxyAssignment);
  }

  /**
   * 从外部加载持久化的绑定关系
   * @param {Map|Object} assignments - 账户到代理的映射
   */
  loadProxyAssignments(assignments) {
    if (assignments instanceof Map) {
      this.proxyAssignment = new Map(assignments);
    } else if (typeof assignments === 'object' && assignments !== null) {
      this.proxyAssignment = new Map(Object.entries(assignments));
    }
    logger.info(`从外部加载了 ${this.proxyAssignment.size} 个代理绑定关系`, 'PROXY');
  }
}

// 创建一个全局单例实例，用于在整个应用中共享
const proxyManagerInstance = new ProxyManager();

// 导出类本身用于初始化，导出实例用于调用方法
module.exports = ProxyManager;
module.exports.getInstance = () => proxyManagerInstance;
module.exports.getAllProxyBindings = () => {
  // 返回一个普通对象，而不是 Map
  const assignments = proxyManagerInstance.getProxyAssignments();
  const obj = {};
  for (let [email, proxyUrl] of assignments.entries()) {
    obj[email] = proxyUrl;
  }
  return obj;
};
module.exports.setProxyBinding = (email, proxyUrl) => {
  // 更新实例内部的 Map
  proxyManagerInstance.proxyAssignment.set(email, proxyUrl);
  // 可以在这里添加持久化逻辑，例如保存到文件或内存
  // 例如: saveProxyAssignmentsToFile(proxyManagerInstance.proxyAssignment);
  console.log(`DEBUG: Binding ${email} to ${proxyUrl}`); // 临时调试日志
  return true; // 假设总是成功
};