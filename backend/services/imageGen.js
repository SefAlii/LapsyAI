const axios = require('axios')

async function generateImage(prompt, quality, providerConfig) {
  switch (providerConfig.name) {
    case 'cloudflare':
      return generateCloudflare(prompt, quality, providerConfig)
    case 'replicate':
      return generateReplicate(prompt, quality, providerConfig)
    case 'fal':
      return generateFal(prompt, quality, providerConfig)
    default:
      throw new Error(`Unknown image provider: ${providerConfig.name}`)
  }
}

// ─── Cloudflare Workers AI ───────────────────────────────────────────────────

async function generateCloudflare(prompt, quality, config) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID not set in .env')

  const apiKey = config.apiKey || process.env.CLOUDFLARE_API_KEY
  if (!apiKey) throw new Error('Cloudflare API key not configured')

  // flux-1-schnell hard limit is 4 steps; SDXL-based models support more
  const isFluxSchnell = config.modelId.includes('flux-1-schnell')
  const numSteps = isFluxSchnell
    ? 4
    : (quality === 'ultra' ? 50 : quality === 'high' ? 30 : 20)

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${config.modelId}`

  console.log(`[imageGen] Cloudflare: model=${config.modelId} num_steps=${numSteps}`)

  let response
  try {
    response = await axios.post(
      url,
      { prompt, num_steps: numSteps, width: 576, height: 1024 },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        responseType: 'arraybuffer',
        timeout: 120000
      }
    )
  } catch (err) {
    if (err.response) {
      const rawBody = err.response.data
      const bodyText = Buffer.isBuffer(rawBody) || rawBody instanceof ArrayBuffer
        ? Buffer.from(rawBody).toString('utf8')
        : JSON.stringify(rawBody)
      console.error(`[imageGen] Cloudflare HTTP ${err.response.status}:`, bodyText)

      if (err.response.status === 429) {
        console.warn('[imageGen] Cloudflare rate limit hit — waiting 5s then retrying once...')
        await sleep(5000)
        const retryResponse = await axios.post(
          url,
          { prompt, num_steps: numSteps, width: 576, height: 1024 },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            responseType: 'arraybuffer',
            timeout: 120000
          }
        )
        return Buffer.from(retryResponse.data)
      }
    }
    throw err
  }

  return Buffer.from(response.data)
}

// ─── Replicate ────────────────────────────────────────────────────────────────

async function generateReplicate(prompt, quality, config) {
  const apiKey = config.apiKey || process.env.REPLICATE_API_TOKEN
  if (!apiKey) throw new Error('Replicate API key not configured')

  const headers = {
    Authorization: `Token ${apiKey}`,
    'Content-Type': 'application/json'
  }

  // Create prediction
  const createRes = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: config.modelId,
      input: {
        prompt,
        num_inference_steps: quality === 'ultra' ? 50 : quality === 'high' ? 30 : 20,
        width: 576,
        height: 1024
      }
    },
    { headers }
  )

  const predictionId = createRes.data.id

  // Poll until complete
  let result
  for (let i = 0; i < 60; i++) {
    await sleep(3000)
    const pollRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers }
    )
    result = pollRes.data

    if (result.status === 'succeeded') break
    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(`Replicate prediction failed: ${result.error || result.status}`)
    }
  }

  if (result.status !== 'succeeded') {
    throw new Error('Replicate prediction timed out')
  }

  const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output
  if (!outputUrl) throw new Error('Replicate returned no output URL')

  const imgRes = await axios.get(outputUrl, { responseType: 'arraybuffer', timeout: 60000 })
  return Buffer.from(imgRes.data)
}

// ─── Fal.ai ───────────────────────────────────────────────────────────────────

async function generateFal(prompt, quality, config) {
  const apiKey = config.apiKey || process.env.FAL_KEY
  if (!apiKey) throw new Error('Fal.ai API key not configured')

  const { fal } = require('@fal-ai/client')
  fal.config({ credentials: apiKey })

  const result = await fal.subscribe(config.modelId, {
    input: {
      prompt,
      image_size: { width: 576, height: 1024 },
      num_inference_steps: quality === 'ultra' ? 50 : quality === 'high' ? 30 : 4,
      num_images: 1
    },
    pollInterval: 3000
  })

  const imageUrl = result.data?.images?.[0]?.url || result.data?.image?.url
  if (!imageUrl) throw new Error('Fal.ai returned no image URL')

  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 })
  return Buffer.from(imgRes.data)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { generateImage }
