const crypto = require('crypto');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { logger } = require('./logger');

// 辅助函数：创建 fetch 请求的 options
const createFetchOptions = (proxy, method = 'POST', headers = {}, body = null) => {
    const options = {
        method,
        headers,
    };
    if (body) {
        options.body = body;
    }
    if (proxy) {
        try {
            options.agent = new SocksProxyAgent(proxy);
        } catch (e) {
            logger.error(`创建SocksProxyAgent失败: ${e.message}`, 'PROXY');
        }
    }
    return options;
};

/**
 * 为 PKCE 生成随机代码验证器
 * @returns {string} 43-128个字符的随机字符串
 */
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * 使用 SHA-256 从代码验证器生成代码挑战
 * @param {string} codeVerifier - 代码验证器字符串
 * @returns {string} 代码挑战字符串
 */
function generateCodeChallenge(codeVerifier) {
    const hash = crypto.createHash('sha256');
    hash.update(codeVerifier);
    return hash.digest('base64url');
}

/**
 * 生成 PKCE 代码验证器和挑战对
 * @returns {Object} 包含 code_verifier 和 code_challenge 的对象
 */
function generatePKCEPair() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    return {
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
    };
}

class CliAuthManager {
    /**
     * 启动 OAuth 设备授权流程
     * @param {string|null} proxy - 代理地址
     * @returns {Promise<Object>} 包含设备代码、验证URL和代码验证器的对象
     */
    async initiateDeviceFlow(proxy = null) {
        const { code_verifier, code_challenge } = generatePKCEPair();

        const bodyData = new URLSearchParams({
            client_id: "f0304373b74a44d2b584a3fb70ca9e56",
            scope: "openid profile email model.completion",
            code_challenge: code_challenge,
            code_challenge_method: 'S256',
        });

        try {
            const options = createFetchOptions(proxy, 'POST', {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            }, bodyData);
            const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/device/code", options);

            if (response.ok) {
                const result = await response.json();
                return {
                    status: true,
                    ...result,
                    code_verifier: code_verifier,
                };
            } else {
                throw new Error(`Device flow initiation failed with status: ${response.status}`);
            }
        } catch (error) {
            logger.error(`initiateDeviceFlow failed: ${error.message}`, 'CLI_AUTH');
            return { status: false };
        }
    }

    /**
     * 授权登录
     * @param {string} user_code - 用户代码
     * @param {string} access_token - 访问令牌
     * @param {string|null} proxy - 代理地址
     * @returns {Promise<boolean>} 是否授权成功
     */
    async authorizeLogin(user_code, access_token, proxy = null) {
        try {
            const options = createFetchOptions(proxy, 'POST', {
                'Content-Type': 'application/json',
                "authorization": `Bearer ${access_token}`,
            }, JSON.stringify({
                "approved": true,
                "user_code": user_code,
            }));
            const response = await fetch("https://chat.qwen.ai/api/v2/oauth2/authorize", options);

            return response.ok;
        } catch (error) {
            logger.error(`authorizeLogin failed: ${error.message}`, 'CLI_AUTH');
            return false;
        }
    }

    /**
     * 轮询获取访问令牌
     * @param {string} device_code - 设备代码
     * @param {string} code_verifier - 代码验证器
     * @param {string|null} proxy - 代理地址
     * @returns {Promise<Object>} 访问令牌信息
     */
    async pollForToken(device_code, code_verifier, proxy = null) {
        const pollInterval = 5000;
        const maxAttempts = 60;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const bodyData = new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                client_id: "f0304373b74a44d2b584a3fb70ca9e56",
                device_code: device_code,
                code_verifier: code_verifier,
            });

            try {
                const options = createFetchOptions(proxy, 'POST', {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                }, bodyData);
                const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/token", options);

                if (response.ok) {
                    const tokenData = await response.json();
                    return {
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token || undefined,
                        expiry_date: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
                    };
                }
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } catch (error) {
                logger.error(`Polling attempt ${attempt + 1}/${maxAttempts} failed: ${error.message}`, 'CLI_AUTH');
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
        return { status: false };
    }

    /**
     * 初始化 CLI 账户
     * @param {string} access_token - 访问令牌
     * @param {string|null} proxy - 代理地址
     * @returns {Promise<Object>} 账户信息
     */
    async initCliAccount(access_token, proxy = null) {
        const deviceFlow = await this.initiateDeviceFlow(proxy);
        if (!deviceFlow.status || !await this.authorizeLogin(deviceFlow.user_code, access_token, proxy)) {
            return { status: false };
        }
        return await this.pollForToken(deviceFlow.device_code, deviceFlow.code_verifier, proxy);
    }

    /**
     * 刷新访问令牌
     * @param {Object} CliAccount - 账户信息
     * @param {string|null} proxy - 代理地址
     * @returns {Promise<Object>} 账户信息
     */
    async refreshAccessToken(CliAccount, proxy = null) {
        if (!CliAccount || !CliAccount.refresh_token) {
            logger.error('Refresh token is missing.', 'CLI_AUTH');
            return { status: false };
        }

        const bodyData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: CliAccount.refresh_token,
            client_id: "f0304373b74a44d2b584a3fb70ca9e56",
        });

        try {
            const options = createFetchOptions(proxy, 'POST', {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            }, bodyData);
            const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/token", options);

            if (response.ok) {
                const tokenData = await response.json();
                return {
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || CliAccount.refresh_token,
                    expiry_date: Date.now() + tokenData.expires_in * 1000,
                };
            } else {
                throw new Error(`Token refresh failed with status: ${response.status}`);
            }
        } catch (error) {
            logger.error(`refreshAccessToken failed: ${error.message}`, 'CLI_AUTH');
            return { status: false };
        }
    }
}

module.exports = new CliAuthManager()