const axios = require('axios')

async function assembleVideo(imageUrls, durations, quality, providerConfig) {
  switch (providerConfig.name) {
    case 'fal':
      return assembleFal(imageUrls, durations, quality, providerConfig)
    case 'replicate':
      return assembleReplicate(imageUrls, durations, quality, providerConfig)
    case 'runway':
      return assembleRunway(imageUrls, durations, quality, providerConfig)
    default:
      throw new Error(`Unknown video provider: ${providerConfig.name}`)
  }
}

// ─── Fal.ai ───────────────────────────────────────────────────────────────────

async function assembleFal(imageUrls, durations, quality, config) {
  const apiKey = config.apiKey || process.env.FAL_KEY
  if (!apiKey) throw new Error('Fal.ai API key not configured')

  const { fal } = require('@fal-ai/client')
  fal.config({ credentials: apiKey })

  const totalDuration = durations.reduce((a, b) => a + b, 0)
  const modelId = config.modelId || 'fal-ai/stable-video-diffusion'
  const falEndpoint = `https://fal.run/${modelId}`

  // Models that accept prompt + duration vs SVD-style (image_url + motion params only)
  const KLING_STYLE_MODELS = ['kling-video', 'luma', 'mochi', 'wan', 'minimax', 'hailuo']
  const isKlingStyle = KLING_STYLE_MODELS.some(k => modelId.includes(k))

  let input
  if (isKlingStyle) {
    input = {
      image_url: imageUrls[0],
      prompt: 'cinematic timelapse, smooth motion, photorealistic, high quality',
      duration: String(Math.min(Math.round(totalDuration), 10)),
      aspect_ratio: '9:16'
    }
  } else {
    // SVD-style: fal-ai/stable-video-diffusion, fal-ai/fast-svd-lcm, etc.
    // These ONLY accept image_url + motion_bucket_id + fps — no prompt or duration
    const fps = 6
    console.log('fps value:', typeof fps, fps)
    input = {
      image_url: imageUrls[0],
      motion_bucket_id: 127,
      fps
    }
  }

  console.log(`[videoGen] Model: ${modelId}`)
  console.log(`[videoGen] Endpoint: ${falEndpoint}`)
  console.log(`[videoGen] Image URLs (${imageUrls.length}):`, imageUrls)
  console.log('=== VIDEO API PAYLOAD ===')
  console.log(JSON.stringify(input, null, 2))

  let result
  try {
    result = await fal.subscribe(modelId, {
      input,
      pollInterval: 5000,
      onQueueUpdate: (update) => {
        if (update.status) console.log(`[videoGen] Queue status: ${update.status}`)
      }
    })
  } catch (err) {
    console.log('=== VIDEO API ERROR ===')
    console.log(JSON.stringify({
      message: err.message,
      status: err.status,
      body: err.body
    }, null, 2))
    throw new Error(`Fal.ai failed (${err.status || 'unknown'}): ${err.message}`)
  }

  const videoUrl = result.data?.video?.url
    || result.data?.video_url
    || result.data?.url
    || (Array.isArray(result.data) ? result.data[0] : null)

  if (!videoUrl) {
    console.error(`[videoGen] Unexpected result structure:`, JSON.stringify(result.data, null, 2))
    throw new Error('Fal.ai returned no video URL')
  }

  console.log(`[videoGen] Video URL:`, videoUrl)
  const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 180000 })
  return Buffer.from(videoRes.data)
}

// ─── Replicate ────────────────────────────────────────────────────────────────

async function assembleReplicate(imageUrls, durations, quality, config) {
  const apiKey = config.apiKey || process.env.REPLICATE_API_TOKEN
  if (!apiKey) throw new Error('Replicate API key not configured')

  const headers = {
    Authorization: `Token ${apiKey}`,
    'Content-Type': 'application/json'
  }

  const fps = Math.max(4, Math.round(imageUrls.length / durations.reduce((a, b) => a + b, 0)))

  const createRes = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: config.modelId,
      input: {
        images: imageUrls,
        fps,
        motion_bucket_id: quality === 'ultra' ? 180 : 127
      }
    },
    { headers }
  )

  const predictionId = createRes.data.id

  let result
  for (let i = 0; i < 120; i++) {
    await sleep(5000)
    const pollRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers }
    )
    result = pollRes.data

    if (result.status === 'succeeded') break
    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(`Replicate video prediction failed: ${result.error || result.status}`)
    }
  }

  if (result.status !== 'succeeded') {
    throw new Error('Replicate video prediction timed out')
  }

  const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output
  if (!videoUrl) throw new Error('Replicate returned no video URL')

  const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 180000 })
  return Buffer.from(videoRes.data)
}

// ─── RunwayML ─────────────────────────────────────────────────────────────────

async function assembleRunway(imageUrls, durations, quality, config) {
  const apiKey = config.apiKey || process.env.RUNWAY_API_KEY
  if (!apiKey) throw new Error('RunwayML API key not configured')

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': '2024-11-06'
  }

  // Runway Gen-3 Alpha Turbo: image-to-video
  const createRes = await axios.post(
    'https://api.dev.runwayml.com/v1/image_to_video',
    {
      model: config.modelId || 'gen3a_turbo',
      promptImage: imageUrls[0],
      promptText: 'cinematic timelapse, smooth motion, high quality',
      duration: Math.min(durations.reduce((a, b) => a + b, 0), 10),
      ratio: '720:1280'
    },
    { headers }
  )

  const taskId = createRes.data.id

  let taskResult
  for (let i = 0; i < 120; i++) {
    await sleep(5000)
    const pollRes = await axios.get(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      { headers }
    )
    taskResult = pollRes.data

    if (taskResult.status === 'SUCCEEDED') break
    if (taskResult.status === 'FAILED') {
      throw new Error(`RunwayML task failed: ${taskResult.failure || 'unknown error'}`)
    }
  }

  if (taskResult.status !== 'SUCCEEDED') {
    throw new Error('RunwayML task timed out')
  }

  const videoUrl = taskResult.output?.[0]
  if (!videoUrl) throw new Error('RunwayML returned no video URL')

  const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 180000 })
  return Buffer.from(videoRes.data)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { assembleVideo }
