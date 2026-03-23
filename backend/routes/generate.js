const express = require('express')
const router = express.Router()
const Bull = require('bull')
const { v4: uuidv4 } = require('uuid')
const { getRedisConfig } = require('../config/redis')

const pipelineQueue = new Bull('timelapse-pipeline', { redis: getRedisConfig() })

const VALID_DURATIONS = [15, 30, 60, 90]
const VALID_QUALITIES = ['standard', 'high', 'ultra']

router.post('/', async (req, res, next) => {
  try {
    const { prompt, duration, quality } = req.body

    if (!prompt || typeof prompt !== 'string' ||
        prompt.trim().length < 10 || prompt.trim().length > 2000) {
      return res.status(400).json({
        error: 'prompt is required and must be between 10 and 2000 characters'
      })
    }

    if (!VALID_DURATIONS.includes(Number(duration))) {
      return res.status(400).json({
        error: `duration must be one of: ${VALID_DURATIONS.join(', ')}`
      })
    }

    if (!VALID_QUALITIES.includes(quality)) {
      return res.status(400).json({
        error: `quality must be one of: ${VALID_QUALITIES.join(', ')}`
      })
    }

    const jobId = uuidv4()

    await pipelineQueue.add(
      {
        jobId,
        prompt: prompt.trim(),
        duration: Number(duration),
        quality,
        step: 'scenes',
        progress: { current: 0, total: 0 },
        scenes: [],
        imagePaths: [],
        videoUrl: null,
        error: null
      },
      {
        jobId,
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false
      }
    )

    return res.status(202).json({ jobId, status: 'pending' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
module.exports.pipelineQueue = pipelineQueue
