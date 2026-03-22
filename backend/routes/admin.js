const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CONFIG_PATH = path.join(__dirname, '../config.json')

function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return res.status(503).json({ error: 'Admin panel not configured. Set ADMIN_PASSWORD in .env' })
  }

  const provided =
    req.headers['x-admin-password'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')

  if (!provided) {
    return res.status(401).json({ error: 'Missing credentials. Provide X-Admin-Password header.' })
  }

  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided, 'utf8')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Invalid password' })
    }
  } catch {
    return res.status(403).json({ error: 'Invalid password' })
  }

  next()
}

router.get('/config', adminAuth, (req, res) => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    res.json(JSON.parse(raw))
  } catch (err) {
    res.status(500).json({ error: 'Could not read config.json' })
  }
})

router.post('/config', adminAuth, (req, res) => {
  try {
    const { imageProviders, videoProviders } = req.body

    if (!Array.isArray(imageProviders) || !Array.isArray(videoProviders)) {
      return res.status(400).json({ error: 'Invalid config: imageProviders and videoProviders must be arrays' })
    }

    const activeImages = imageProviders.filter(p => p.isActive)
    if (activeImages.length > 1) {
      return res.status(400).json({ error: 'Only one image provider can be active at a time' })
    }

    const activeVideos = videoProviders.filter(p => p.isActive)
    if (activeVideos.length > 1) {
      return res.status(400).json({ error: 'Only one video provider can be active at a time' })
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf8')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Could not write config.json' })
  }
})

module.exports = router
