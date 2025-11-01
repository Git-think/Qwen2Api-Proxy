const { getLatestModels } = require('../models/models-map.js')
const config = require('../config/index.js')

const handleGetModels = async (req, res) => {
    const models = []

    const ModelsMap = await getLatestModels()

    for (const model of ModelsMap) {
        delete model.name
        models.push(model)

        if (config.simpleModelMap) {
            continue
        }

        const isThinking = model?.info?.meta?.abilities?.thinking
        const isSearch = model?.info?.meta?.chat_type?.includes('search')
        const isImage = model?.info?.meta?.chat_type?.includes('t2i')
        const isVideo = model?.info?.meta?.chat_type?.includes('t2v')
        const isImageEdit = model?.info?.meta?.chat_type?.includes('image_edit')
        const isDeepResearch = model?.info?.meta?.chat_type?.includes('deep_research')

        if (isThinking) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-thinking`

            models.push(newModelData)
        }

        if (isSearch) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-search`
            models.push(newModelData)
        }

        if (isThinking && isSearch) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-thinking-search`
            models.push(newModelData)
        }

        if (isImage) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-image`
            models.push(newModelData)
        }

        if (isVideo) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-video`
            models.push(newModelData)
        }

        if (isImageEdit) {
            const newModelData = JSON.parse(JSON.stringify(model))
            newModelData.id = `${model.id}-image-edit`
            models.push(newModelData)
        }

        // if (isDeepResearch) {
        //     const newModelData = JSON.parse(JSON.stringify(model))
        //     newModelData.id = `${model.id}-deep-research`
        //     models.push(newModelData)
        // }
    }
    res.json({
        "object": "list",
        "data": models
    })
}

module.exports = {
    handleGetModels
}