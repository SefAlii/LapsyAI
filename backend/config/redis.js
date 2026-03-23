function getRedisConfig() {
  const ioredisOpts = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }

  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL, ...ioredisOpts }
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    ...ioredisOpts
  }
}

module.exports = { getRedisConfig }
