const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const config = require('../config/index.js');
const { logger } = require('./logger');

class ProxyManager {
  constructor() {
    // 新的数据结构，用于跟踪每个代理的详细状态
    this.proxies = new Map(); // Key: proxyUrl, Value: { url, status, assignedAccounts }
    config.socks5Proxies.forEach(proxyUrl => {
      this.proxies.set(proxyUrl, {
        url: proxyUrl,
        status: 'untested', // 'untested', 'available', 'failed'
        assignedAccounts: new Set(), // 存储绑定到此代理的账户邮箱
      });
    });

    this.proxyAssignment = new Map(); // 存储账户邮箱到代理URL的映射
  }

  /**
   * 初始化管理器：仅加载持久化的绑定关系，不在此处进行测试
   * @param {Map|Object} savedBindings - 从 data.json 加载的持久化绑定
   */
  initialize(savedBindings = {}) {
    this.loadProxyAssignments(savedBindings);
    logger.success(`代理管理器初始化完成，共加载 ${this.proxies.size} 个代理`, 'PROXY');
  }

  /**
   * 按需测试单个代理的可用性
   * @param {string} proxyUrl - 代理地址
   * @returns {Promise<boolean>} 代理是否可用
   * @private
   */
  async _testProxy(proxyUrl) {
    const proxyData = this.proxies.get(proxyUrl);
    if (!proxyData) return false;

    logger.info(`正在测试代理: ${proxyUrl}`, 'PROXY');
    const timeout = 10000; // 10秒超时
    try {
      const agent = new SocksProxyAgent(proxyUrl);
      await axios.get('https://www.google.com/generate_204', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: timeout,
        validateStatus: (status) => status === 204,
      });

      logger.info(`代理 ${proxyUrl} 测试成功`, 'PROXY');
      proxyData.status = 'available';
      return true;
    } catch (error) {
      logger.error(`代理 ${proxyUrl} 测试失败: ${error.message}`, 'PROXY');
      proxyData.status = 'failed';
      return false;
    }
  }

  /**
   * 启动时验证已绑定的代理，并处理重复绑定
   * @returns {Promise<Map<string, string>>} 返回需要重新分配代理的账户Map { email: reason }
   */
  async validateAndRebalanceBindings() {
    const needsReassignment = new Map();
    const proxyUsageCount = new Map();

    // 1. 验证已绑定的代理是否可用
    for (const [email, proxyUrl] of this.proxyAssignment.entries()) {
      const proxyData = this.proxies.get(proxyUrl);
      if (proxyData) {
        // 只有 untested 的代理需要测试
        if (proxyData.status === 'untested') {
          await this._testProxy(proxyUrl);
        }
        if (proxyData.status === 'failed') {
          needsReassignment.set(email, '原绑定代理失效');
          this.proxyAssignment.delete(email);
          proxyData.assignedAccounts.delete(email);
        }
      } else {
        // 绑定的代理已从配置中移除
        needsReassignment.set(email, '原绑定代理已不存在');
        this.proxyAssignment.delete(email);
      }
    }

    // 2. 统计代理使用次数并找出重复
    for (const [email, proxyUrl] of this.proxyAssignment.entries()) {
        if (!proxyUsageCount.has(proxyUrl)) {
            proxyUsageCount.set(proxyUrl, []);
        }
        proxyUsageCount.get(proxyUrl).push(email);
    }

    // 3. 处理重复绑定
    const hasFreeProxies = [...this.proxies.values()].some(p => p.status === 'untested' || (p.status === 'available' && p.assignedAccounts.size === 0));

    for (const [proxyUrl, accounts] of proxyUsageCount.entries()) {
        if (accounts.length > 1) {
            // 如果没有空闲代理，则保留重复绑定并发出警告
            if (!hasFreeProxies) {
                logger.warn(`检测到代理 ${proxyUrl} 被 ${accounts.length} 个账户共享，但无空闲代理可供转移，暂时保留绑定。`, 'PROXY');
                continue;
            }

            // 如果有空闲代理，则为多余的账户触发重新分配
            logger.info(`检测到代理 ${proxyUrl} 被 ${accounts.length} 个账户共享，将尝试为多余的账户重新分配代理。`, 'PROXY');
            for (let i = 1; i < accounts.length; i++) {
                const emailToReassign = accounts[i];
                needsReassignment.set(emailToReassign, '处理重复绑定');
                this.proxyAssignment.delete(emailToReassign);
                this.proxies.get(proxyUrl)?.assignedAccounts.delete(emailToReassign);
            }
        }
    }
    
    return needsReassignment;
  }

  /**
   * 为账户分配一个代理（实现新的智能策略）
   * @param {string} email - 账户邮箱
   * @returns {Promise<string|null>} 分配的代理URL或null
   */
  async assignProxy(email) {
    // 如果已有绑定，直接返回
    if (this.proxyAssignment.has(email)) {
      return this.proxyAssignment.get(email);
    }

    // 策略 1: 寻找一个完全未被使用的 'available' 代理
    for (const proxy of this.proxies.values()) {
      if (proxy.status === 'available' && proxy.assignedAccounts.size === 0) {
        return this._bindProxyToAccount(email, proxy);
      }
    }

    // 策略 2: 寻找并测试一个 'untested' 的代理
    const untestedProxies = [...this.proxies.values()].filter(p => p.status === 'untested');
    if (untestedProxies.length > 0) {
      // 随机化以避免每次都测试同一个
      untestedProxies.sort(() => Math.random() - 0.5);
      for (const proxy of untestedProxies) {
        if (await this._testProxy(proxy.url)) {
          return this._bindProxyToAccount(email, proxy);
        }
      }
    }

    // 策略 3: 如果没有未测试或未使用的代理，则选择一个绑定账户最少的 'available' 代理
    const availableProxies = [...this.proxies.values()].filter(p => p.status === 'available');
    if (availableProxies.length > 0) {
      availableProxies.sort((a, b) => a.assignedAccounts.size - b.assignedAccounts.size);
      const bestProxy = availableProxies[0];
      return this._bindProxyToAccount(email, bestProxy);
    }

    logger.error(`没有可用的代理供账户 ${email} 使用`, 'PROXY');
    return null;
  }

  /**
   * 将代理绑定到账户的辅助函数
   * @private
   */
  _bindProxyToAccount(email, proxyData) {
    this.proxyAssignment.set(email, proxyData.url);
    proxyData.assignedAccounts.add(email);
    logger.info(`为账户 ${email} 分配代理: ${proxyData.url}`, 'PROXY');
    return proxyData.url;
  }

  /**
   * 从外部加载持久化的绑定关系
   * @param {Map|Object} assignments - 账户到代理的映射
   */
  loadProxyAssignments(assignments) {
    let loadedAssignments;
    if (assignments instanceof Map) {
      loadedAssignments = new Map(assignments);
    } else if (typeof assignments === 'object' && assignments !== null) {
      loadedAssignments = new Map(Object.entries(assignments));
    } else {
      return;
    }

    for (const [email, proxyUrl] of loadedAssignments.entries()) {
      if (this.proxies.has(proxyUrl)) {
        this.proxyAssignment.set(email, proxyUrl);
        this.proxies.get(proxyUrl).assignedAccounts.add(email);
      }
    }
    logger.info(`从外部加载了 ${this.proxyAssignment.size} 个有效的代理绑定关系`, 'PROXY');
  }

  /**
   * 获取持久化绑定关系
   * @returns {Map} 账户到代理的映射
   */
  getProxyAssignments() {
    return new Map(this.proxyAssignment);
  }

  getAvailableProxyCount() {
    return [...this.proxies.values()].filter(p => p.status === 'available').length;
  }
}

module.exports = ProxyManager;