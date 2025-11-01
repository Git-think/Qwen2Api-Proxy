const express = require('express')
const router = express.Router()
const { apiKeyVerify } = require('../middlewares/authorization')
const { handleGetModels } = require('../controllers/models.js')

router.get('/v1/models', apiKeyVerify, handleGetModels)

router.get('/models', handleGetModels)

router.post('/cli/v1/models', async (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: 'qwen3-coder-plus',
                object: 'model',
                created: 1719878112,
                owned_by: 'qwen-code'
            },
            {
                id: 'qwen3-coder-flash',
                object: 'model',
                created: 1719878112,
                owned_by: 'qwen-code'
            },
        ]
    })
})


module.exports = router
