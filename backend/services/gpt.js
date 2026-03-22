const { OpenAI } = require('openai')

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are "Viral Timelapse Architect" — an expert at creating satisfying, viral-worthy home and architecture transformation video scripts for TikTok and Instagram Reels.

When given a keyword or topic, you MUST:

1. First output a short creative brief:
   - Before state description
   - After state description
   - Key Materials involved
   - Viral Hook (one sentence that explains why viewers can't stop watching)

2. Then generate exactly 8 scenes. Each scene must follow this structure:
   - Scene number and title
   - Shot type (wide, close-up, overhead, cinematic glide, etc.)
   - Exact visual content (what is visible, what action is happening)
   - Lighting description
   - Camera movement

3. For each scene, generate an image_prompt optimized for AI image generation:
   - Must be detailed, photorealistic
   - Must specify vertical framing (portrait orientation, 9:16)
   - Must include: shot type, subject, materials, lighting, style
   - Style anchor: "cinematic, photorealistic, sharp focus, professional photography"

Return ONLY a valid JSON object in this exact format:
{
  "brief": {
    "before": "...",
    "after": "...",
    "materials": "...",
    "viral_hook": "..."
  },
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "description": "...",
      "duration_seconds": 4,
      "image_prompt": "..."
    }
  ]
}

No extra text. No markdown. Only raw JSON.`

async function generateScenes(prompt, duration, quality) {
  const userPrompt = [
    `Topic / keyword: ${prompt}`,
    ``,
    `Total video duration: ${duration} seconds`,
    `Quality level: ${quality.toUpperCase()}`,
    ``,
    `Generate exactly 8 scenes. Distribute duration_seconds so they sum to exactly ${duration}.`
  ].join('\n')

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.8,
    max_tokens: 4096
  })

  const raw = response.choices[0].message.content

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`GPT returned non-JSON: ${raw.slice(0, 200)}`)
  }

  if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error('GPT response missing "scenes" array')
  }

  const scenes = parsed.scenes
  const brief = parsed.brief || null

  if (scenes.length !== 8) {
    throw new Error(`GPT returned ${scenes.length} scenes; expected exactly 8`)
  }

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]
    const idx = i + 1

    if (typeof s.scene_number !== 'number') {
      throw new Error(`Scene ${idx}: missing or invalid scene_number`)
    }
    if (typeof s.title !== 'string' || s.title.trim().length === 0) {
      throw new Error(`Scene ${idx}: missing title`)
    }
    if (typeof s.description !== 'string' || s.description.trim().length === 0) {
      throw new Error(`Scene ${idx}: missing description`)
    }
    if (typeof s.duration_seconds !== 'number' || s.duration_seconds <= 0) {
      throw new Error(`Scene ${idx}: invalid duration_seconds`)
    }
    if (typeof s.image_prompt !== 'string' || s.image_prompt.trim().length < 20) {
      throw new Error(`Scene ${idx}: image_prompt too short or missing`)
    }
  }

  return { brief, scenes }
}

module.exports = { generateScenes }
