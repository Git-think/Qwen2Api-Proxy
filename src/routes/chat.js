const express = require('express')
const router = express.Router()
const { apiKeyVerify } = require('../middlewares/authorization.js')
const { processRequestBody } = require('../middlewares/chat-middleware.js')
const { handleChatCompletion } = require('../controllers/chat.js')
const { handleImageVideoCompletion } = require('../controllers/chat.image.video.js')

const selectChatCompletion = (req, res, next) => {
    const ChatCompletionMap = {
        't2t': handleChatCompletion,
        'search': handleChatCompletion,
        't2i': handleImageVideoCompletion,
        't2v': handleImageVideoCompletion,
        'image_edit': handleImageVideoCompletion,
        //   'deep_research': handleDeepResearchCompletion
    }

    const chatType = req.body.chat_type
    const chatCompletion = ChatCompletionMap[chatType]
    if (chatCompletion) {
        chatCompletion(req, res, next)
    } else {
        handleImageCompletion(req, res, next)
    }
}

router.post('/v1/chat/completions',
    apiKeyVerify,
    processRequestBody,
    selectChatCompletion
)


module.exports = router