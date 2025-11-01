const { logger } = require('./logger');
const { sha256Encrypt, generateUUID } = require('./tools.js');
const { uploadFileToQwenOss } = require('./upload.js');
const accountManager = require('./account.js');
const CacheManager = require('./img-caches.js');

/**
 * 判断聊天类型
 * @param {string} model - 模型名称
 * @param {boolean} search - 是否搜索模式
 * @returns {string} 聊天类型 ('search' 或 't2t')
 */
const isChatType = (model) => {
    if (!model) return 't2t';
    if (model.includes('-search')) {
        return 'search';
    } else if (model.includes('-image-edit')) {
        return 'image_edit';
    } else if (model.includes('-image')) {
        return 't2i';
    } else if (model.includes('-video')) {
        return 't2v';
    } else if (model.includes('-deep-research')) {
        return 'deep_research';
    } else {
        return 't2t';
    }
}

/**
 * 判断是否启用思考模式
 * @param {string} model - 模型名称
 * @param {boolean} enable_thinking - 是否启用思考
 * @param {number} thinking_budget - 思考预算
 * @returns {object} 思考配置对象
 */
const isThinkingEnabled = (model, enable_thinking, thinking_budget) => {
    const thinking_config = {
        "output_schema": "phase",
        "thinking_enabled": false,
        "thinking_budget": 81920
    }

    if (!model) return thinking_config;

    if (model.includes('-thinking') || enable_thinking) {
        thinking_config.thinking_enabled = true;
    }

    if (thinking_budget && Number(thinking_budget) !== Number.NaN && Number(thinking_budget) > 0 && Number(thinking_budget) < 38912) {
        thinking_config.budget = Number(thinking_budget);
    }

    return thinking_config;
}

/**
 * 解析模型名称,移除特殊后缀
 * @param {string} model - 原始模型名称
 * @returns {string} 解析后的模型名称
 */
const parserModel = (model) => {
    if (!model) return 'qwen3-coder-plus';

    try {
        model = String(model);
        model = model.replace('-search', '');
        model = model.replace('-thinking', '');
        model = model.replace('-edit', '');
        model = model.replace('-video', '');
        model = model.replace('-deep-research', '');
        model = model.replace('-image', '');
        return model;
    } catch (e) {
        return 'qwen3-coder-plus';
    }
}

/**
 * 从消息中提取文本内容
 * @param {string|Array} content - 消息内容
 * @returns {string} 提取的文本
 */
const extractTextFromContent = (content) => {
    if (typeof content === 'string') {
        return content;
    } else if (Array.isArray(content)) {
        const textParts = content
            .filter(item => item.type === 'text')
            .map(item => item.text || '');
        return textParts.join(' ');
    }
    return '';
}

/**
 * 格式化消息为文本（包含角色标注）
 * @param {object} message - 单条消息
 * @returns {string} 格式化后的消息文本
 */
const formatSingleMessage = (message) => {
    const role = message.role;
    const content = extractTextFromContent(message.content);
    return content.trim() ? `${role}:${content}` : '';
}

/**
 * 格式化历史消息为文本前缀
 * @param {Array} messages - 消息数组(不包含最后一条)
 * @returns {string} 格式化后的历史消息
 */
const formatHistoryMessages = (messages) => {
    const formattedParts = [];
    
    for (let message of messages) {
        const formatted = formatSingleMessage(message);
        if (formatted) {
            formattedParts.push(formatted);
        }
    }
    
    return formattedParts.length > 0 ? formattedParts.join(';') : '';
}

/**
 * 解析消息格式,处理图片上传和消息结构
 * @param {Array} messages - 原始消息数组
 * @param {object} thinking_config - 思考配置
 * @param {string} chat_type - 聊天类型
 * @returns {Promise<Array>} 解析后的消息数组
 */
const parserMessages = async (messages, thinking_config, chat_type) => {
    try {
        const feature_config = thinking_config;
        const imgCacheManager = new CacheManager();

        // 如果只有一条消息,使用原有逻辑处理（不标注角色）
        if (messages.length <= 1) {
            logger.network('单条消息，使用原格式处理', 'PARSER');
            return await processOriginalLogic(messages, thinking_config, chat_type, imgCacheManager);
        }

        // 多条消息的情况:分离历史消息和最后一条消息
        logger.network('多条消息，格式化处理并标注角色', 'PARSER');
        const historyMessages = messages.slice(0, -1);
        const lastMessage = messages[messages.length - 1];

        // 格式化历史消息为文本前缀
        const historyText = formatHistoryMessages(historyMessages);

        // 处理最后一条消息
        let finalContent = [];
        let lastMessageText = '';
        const lastMessageRole = lastMessage.role;

        if (typeof lastMessage.content === 'string') {
            lastMessageText = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
            // 处理最后一条消息中的内容
            for (let item of lastMessage.content) {
                if (item.type === 'text') {
                    lastMessageText += item.text || '';
                } else if (item.type === 'image' || item.type === 'image_url') {
                    // 处理图片上传
                    let base64 = null;
                    if (item.type === 'image_url') {
                        base64 = item.image_url.url;
                    }

                    if (base64) {
                        const regex = /data:(.+);base64,/;
                        const fileType = base64.match(regex);
                        const fileExtension = fileType && fileType[1] ? fileType[1].split('/')[1] || 'png' : 'png';
                        const filename = `${generateUUID()}.${fileExtension}`;
                        base64 = base64.replace(regex, '');
                        const signature = sha256Encrypt(base64);

                        try {
                            const buffer = Buffer.from(base64, 'base64');
                            const cacheIsExist = imgCacheManager.cacheIsExist(signature);
                            
                            if (cacheIsExist) {
                                finalContent.push({
                                    type: 'image',
                                    image: imgCacheManager.getCache(signature).url
                                });
                            } else {
                                const uploadResult = await uploadFileToQwenOss(buffer, filename, accountManager.getAccountToken());
                                if (uploadResult && uploadResult.status === 200) {
                                    finalContent.push({
                                        type: 'image',
                                        image: uploadResult.file_url
                                    });
                                    imgCacheManager.addCache(signature, uploadResult.file_url);
                                }
                            }
                        } catch (error) {
                            logger.error('图片上传失败', 'UPLOAD', '', error);
                        }
                    }
                }
            }
        }

        // 组合最终内容:历史文本 + 当前消息（带角色标注）
        let combinedText = '';
        if (historyText) {
            combinedText = historyText + ';';
        }
        // 添加最后一条消息，带角色标注
        if (lastMessageText.trim()) {
            combinedText += `${lastMessageRole}:${lastMessageText}`;
        }

        // 如果有图片,创建包含文本和图片的content数组
        if (finalContent.length > 0) {
            finalContent.unshift({
                type: 'text',
                text: combinedText,
                chat_type: 't2t',
                feature_config: {
                    "output_schema": "phase",
                    "thinking_enabled": false,
                }
            });

            return [
                {
                    "role": "user",
                    "content": finalContent,
                    "chat_type": chat_type,
                    "extra": {},
                    "feature_config": feature_config
                }
            ];
        } else {
            // 纯文本情况
            return [
                {
                    "role": "user",
                    "content": combinedText,
                    "chat_type": chat_type,
                    "extra": {},
                    "feature_config": feature_config
                }
            ];
        }

    } catch (e) {
        logger.error('消息解析失败', 'PARSER', '', e);
        return [
            {
                "role": "user",
                "content": "直接返回字符串: '聊天历史处理有误...'",
                "chat_type": "t2t",
                "extra": {},
                "feature_config": {
                    "output_schema": "phase",
                    "enabled": false,
                }
            }
        ];
    }
}

/**
 * 原有的单条消息处理逻辑
 * @param {Array} messages - 消息数组
 * @param {object} thinking_config - 思考配置
 * @param {string} chat_type - 聊天类型
 * @param {object} imgCacheManager - 图片缓存管理器
 * @returns {Promise<Array>} 处理后的消息数组
 */
const processOriginalLogic = async (messages, thinking_config, chat_type, imgCacheManager) => {
    const feature_config = thinking_config;

    for (let message of messages) {
        if (message.role === 'user' || message.role === 'assistant') {
            message.chat_type = "t2t";
            message.extra = {};
            message.feature_config = {
                "output_schema": "phase",
                "thinking_enabled": false,
            };

            if (!Array.isArray(message.content)) continue;

            const newContent = [];

            for (let item of message.content) {
                if (item.type === 'image' || item.type === 'image_url') {
                    let base64 = null;
                    if (item.type === 'image_url') {
                        base64 = item.image_url.url;
                    }
                    if (base64) {
                        const regex = /data:(.+);base64,/;
                        const fileType = base64.match(regex);
                        const fileExtension = fileType && fileType[1] ? fileType[1].split('/')[1] || 'png' : 'png';
                        const filename = `${generateUUID()}.${fileExtension}`;
                        base64 = base64.replace(regex, '');
                        const signature = sha256Encrypt(base64);

                        try {
                            const buffer = Buffer.from(base64, 'base64');
                            const cacheIsExist = imgCacheManager.cacheIsExist(signature);
                            if (cacheIsExist) {
                                delete item.image_url;
                                item.type = 'image';
                                item.image = imgCacheManager.getCache(signature).url;
                                newContent.push(item);
                            } else {
                                const uploadResult = await uploadFileToQwenOss(buffer, filename, accountManager.getAccountToken());
                                if (uploadResult && uploadResult.status === 200) {
                                    delete item.image_url;
                                    item.type = 'image';
                                    item.image = uploadResult.file_url;
                                    imgCacheManager.addCache(signature, uploadResult.file_url);
                                    newContent.push(item);
                                }
                            }

                        } catch (error) {
                            logger.error('图片上传失败', 'UPLOAD', '', error);
                        }
                    }
                } else if (item.type === 'text') {
                    item.chat_type = 't2t';
                    item.feature_config = {
                        "output_schema": "phase",
                        "thinking_enabled": false,
                    };

                    if (newContent.length >= 2) {
                        messages.push({
                            "role": "user",
                            "content": item.text,
                            "chat_type": "t2t",
                            "extra": {},
                            "feature_config": {
                                "output_schema": "phase",
                                "thinking_enabled": false,
                            }
                        });
                    } else {
                        newContent.push(item);
                    }
                }
            }
        } else {
            if (Array.isArray(message.content)) {
                let system_prompt = '';
                for (let item of message.content) {
                    if (item.type === 'text') {
                        system_prompt += item.text;
                    }
                }
                if (system_prompt) {
                    message.content = system_prompt;
                }
            }
        }
    }

    messages[messages.length - 1].feature_config = feature_config;
    messages[messages.length - 1].chat_type = chat_type;

    return messages;
}

module.exports = {
    isChatType,
    isThinkingEnabled,
    parserModel,
    parserMessages
}
