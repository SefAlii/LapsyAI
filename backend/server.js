require('dotenv').config()

const express = require('express')
const cors = require('cors')
const path = require('path')

const generateRouter = require('./routes/generate')
const statusRouter = require('./routes/status')
const adminRouter = require('./routes/admin')

const app = express()
const PORT = process.env.PORT || 3000

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))

// ─── Static: frontend pages ───────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../frontend')))

// ─── Static: output files (images + videos) ──────────────────────────────────
// CRITICAL: video APIs fetch images by public URL — this makes them reachable

app.use('/output', express.static(path.join(__dirname, 'output')))

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/generate', generateRouter)
app.use('/status', statusRouter)
app.use('/admin', adminRouter)

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[server error]', err.stack)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})

module.exports = app
