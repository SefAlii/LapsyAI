function getRedisConfig() {
  const ioredisOpts = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL

  if (redisUrl) {
    console.log('[redis] Connecting via URL:', redisUrl.replace(/:\/\/.*@/, '://***@'))
    return { url: redisUrl, ...ioredisOpts }
  }

  const host = process.env.REDIS_HOST || process.env.REDISHOST || '127.0.0.1'
  const port = parseInt(process.env.REDIS_PORT || process.env.REDISPORT || '6379')
  const password = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD || undefined

  console.log(`[redis] Connecting via host: ${host}:${port}`)
  return { host, port, password, ...ioredisOpts }
}

module.exports = { getRedisConfig }
