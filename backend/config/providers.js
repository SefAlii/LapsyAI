const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '../config.json')

function getConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

function getActiveProviders() {
  const config = getConfig()

  const imageProvider = config.imageProviders.find(p => p.isActive)
  if (!imageProvider) {
    throw new Error('No active image provider configured. Visit /admin to set one up.')
  }

  const videoProvider = config.videoProviders.find(p => p.isActive)
  if (!videoProvider) {
    throw new Error('No active video provider configured. Visit /admin to set one up.')
  }

  return { imageProvider, videoProvider }
}

module.exports = { getConfig, getActiveProviders }
