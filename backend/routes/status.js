const express = require('express')
const router = express.Router()
const Bull = require('bull')
const { getRedisConfig } = require('../config/redis')

const pipelineQueue = new Bull('timelapse-pipeline', { redis: getRedisConfig() })

const STATUS_MAP = {
  waiting:   'pending',
  active:    'processing',
  completed: 'done',
  failed:    'failed',
  delayed:   'pending',
  paused:    'pending'
}

router.get('/:jobId', async (req, res, next) => {
  try {
    const job = await pipelineQueue.getJob(req.params.jobId)

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const bullState = await job.getState()

    return res.json({
      jobId:      job.data.jobId,
      status:     STATUS_MAP[bullState] || 'pending',
      step:       job.data.step       || 'scenes',
      progress:   job.data.progress   || { current: 0, total: 0 },
      brief:      job.data.brief      || null,
      scenes:     job.data.scenes     || [],
      imagePaths: job.data.imagePaths || [],
      videoUrl:   job.data.videoUrl   || null,
      error:      job.data.error      || null
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
