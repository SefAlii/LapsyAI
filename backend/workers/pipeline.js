require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const Bull = require('bull')
const path = require('path')
const fs = require('fs')

const { generateScenes } = require('../services/gpt')
const { generateImage } = require('../services/imageGen')
const { assembleVideo } = require('../services/videoGen')
const { getActiveProviders } = require('../config/providers')

const OUTPUT_DIR = path.join(__dirname, '../output')

const { getRedisConfig } = require('../config/redis')

const pipelineQueue = new Bull('timelapse-pipeline', { redis: getRedisConfig() })

pipelineQueue.process(async (job) => {
  const { jobId, prompt, duration, quality } = job.data

  console.log(`[worker] Starting job ${jobId} — "${prompt.slice(0, 60)}..."`)

  // Prepare output directories
  const jobDir = path.join(OUTPUT_DIR, jobId)
  const imagesDir = path.join(jobDir, 'images')
  fs.mkdirSync(imagesDir, { recursive: true })

  // ─── STEP 1: Scene Generation ─────────────────────────────────────────────

  await job.update({ ...job.data, step: 'scenes', progress: { current: 0, total: 0 } })
  console.log(`[worker] ${jobId} — Generating scenes via GPT...`)

  let brief, scenes
  try {
    ;({ brief, scenes } = await generateScenes(prompt, duration, quality))
    console.log(`[worker] ${jobId} — Got ${scenes.length} scenes`)
    if (brief) console.log(`[worker] ${jobId} — Hook: ${brief.viral_hook}`)
  } catch (err) {
    await job.update({ ...job.data, error: `Scene generation failed: ${err.message}` })
    throw err
  }

  await job.update({
    ...job.data,
    step: 'images',
    brief,
    scenes,
    progress: { current: 0, total: scenes.length }
  })

  // ─── STEP 2: Image Generation ─────────────────────────────────────────────

  const { imageProvider } = getActiveProviders()
  const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
  const imagePaths = []
  const imageUrls = []

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const filename = `scene_${String(i + 1).padStart(3, '0')}.png`
    const filePath = path.join(imagesDir, filename)

    console.log(`[worker] ${jobId} — Generating image ${i + 1}/${scenes.length}...`)

    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const imageBuffer = await generateImage(scene.image_prompt, quality, imageProvider)
        fs.writeFileSync(filePath, imageBuffer)
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        console.warn(`[worker] ${jobId} — Image gen attempt ${attempt} failed for scene ${i + 1}: ${err.message}`)
        if (attempt < 3) await sleep(2000 * attempt)
      }
    }

    if (lastErr) {
      await job.update({ ...job.data, error: `Image generation failed at scene ${i + 1}: ${lastErr.message}` })
      throw lastErr
    }

    const publicUrl = `${BASE_URL}/output/${jobId}/images/${filename}`
    imagePaths.push(filePath)
    imageUrls.push(publicUrl)

    console.log(`[worker] ${jobId} — Saved: ${filePath} (${fs.statSync(filePath).size} bytes)`)
    console.log(`[worker] ${jobId} — Public URL: ${publicUrl}`)

    await job.update({
      ...job.data,
      imagePaths,
      progress: { current: i + 1, total: scenes.length }
    })

    console.log(`[worker] ${jobId} — Image ${i + 1}/${scenes.length} done`)

    // Throttle: avoid Cloudflare free-tier rate limit (429)
    if (i < scenes.length - 1) await sleep(2000)
  }

  // ─── STEP 3: Video Assembly ───────────────────────────────────────────────

  await job.update({
    ...job.data,
    step: 'video',
    progress: { current: scenes.length, total: scenes.length }
  })

  console.log(`[worker] ${jobId} — Assembling video...`)

  const { videoProvider } = getActiveProviders()
  const durations = scenes.map(s => s.duration_seconds)

  console.log(`[worker] ${jobId} — Sending ${imageUrls.length} image URLs to video API:`)
  imageUrls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`))

  let videoBuffer
  try {
    videoBuffer = await assembleVideo(imageUrls, durations, quality, videoProvider)
  } catch (err) {
    await job.update({ ...job.data, error: `Video assembly failed: ${err.message}` })
    throw err
  }

  // ─── STEP 4: Save + Complete ──────────────────────────────────────────────

  const videoPath = path.join(jobDir, 'video.mp4')
  const videoUrl = `${BASE_URL}/output/${jobId}/video.mp4`

  fs.writeFileSync(videoPath, videoBuffer)

  await job.update({
    ...job.data,
    step: 'complete',
    videoUrl,
    error: null
  })

  console.log(`[worker] ${jobId} — Complete! Video: ${videoUrl}`)
  return { jobId, videoUrl }
})

pipelineQueue.on('failed', (job, err) => {
  console.error(`[worker] Job ${job.data.jobId} failed:`, err.message)
})

pipelineQueue.on('completed', (job, result) => {
  console.log(`[worker] Job ${job.data.jobId} completed. Video: ${result.videoUrl}`)
})

pipelineQueue.on('error', (err) => {
  console.error('[worker] Queue error:', err.message)
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

console.log('[worker] Pipeline worker started. Waiting for jobs...')
