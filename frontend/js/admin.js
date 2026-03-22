(function () {
  // ─── Known models per provider ──────────────────────────────────────────────

  const IMAGE_MODELS = {
    cloudflare: [
      { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', label: 'Stable Diffusion XL Base' },
      { id: '@cf/black-forest-labs/flux-1-schnell', label: 'Flux 1 Schnell (fast)' },
      { id: '@cf/lykon/dreamshaper-8-lcm', label: 'DreamShaper 8 LCM' },
      { id: '@cf/runwayml/stable-diffusion-v1-5-inpainting', label: 'SD v1.5 Inpainting' }
    ],
    replicate: [
      { id: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37291fae17ca8b956c1cfc6b', label: 'SDXL (Stability AI)' },
      { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell' },
      { id: 'black-forest-labs/flux-dev', label: 'Flux Dev' },
      { id: 'custom', label: 'Custom model version...' }
    ],
    fal: [
      { id: 'fal-ai/flux/schnell', label: 'Flux Schnell (fast)' },
      { id: 'fal-ai/flux/dev', label: 'Flux Dev' },
      { id: 'fal-ai/stable-diffusion-xl', label: 'Stable Diffusion XL' },
      { id: 'fal-ai/aura-flow', label: 'Aura Flow' }
    ]
  }

  const VIDEO_MODELS = {
    fal: [
      { id: 'fal-ai/kling-video/v1.5/pro/image-to-video', label: 'Kling v1.5 Pro (best quality)' },
      { id: 'fal-ai/kling-video/v1/standard/image-to-video', label: 'Kling v1 Standard' },
      { id: 'fal-ai/stable-video-diffusion', label: 'Stable Video Diffusion' },
      { id: 'fal-ai/fast-svd-lcm', label: 'Fast SVD LCM' }
    ],
    replicate: [
      { id: 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438', label: 'Stable Video Diffusion' },
      { id: 'custom', label: 'Custom model version...' }
    ],
    runway: [
      { id: 'gen3a_turbo', label: 'Gen-3 Alpha Turbo' },
      { id: 'gen3a', label: 'Gen-3 Alpha' }
    ]
  }

  // ─── State ──────────────────────────────────────────────────────────────────

  let adminPassword = null
  let config = null

  // ─── Auth ───────────────────────────────────────────────────────────────────

  document.getElementById('auth-btn').addEventListener('click', attemptAuth)
  document.getElementById('admin-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptAuth()
  })

  document.getElementById('lock-btn').addEventListener('click', (e) => {
    e.preventDefault()
    adminPassword = null
    document.getElementById('admin-ui').classList.add('hidden')
    document.getElementById('auth-overlay').classList.remove('hidden')
    document.getElementById('admin-password').value = ''
  })

  async function attemptAuth() {
    const pw = document.getElementById('admin-password').value.trim()
    if (!pw) return

    document.getElementById('auth-btn').disabled = true
    document.getElementById('auth-error').classList.add('hidden')

    try {
      const res = await fetch('/admin/config', {
        headers: { 'X-Admin-Password': pw }
      })

      if (res.status === 403 || res.status === 401) {
        showAuthError('Incorrect password.')
        document.getElementById('auth-btn').disabled = false
        return
      }

      if (!res.ok) {
        showAuthError(`Error: ${res.status}`)
        document.getElementById('auth-btn').disabled = false
        return
      }

      config = await res.json()
      adminPassword = pw
      document.getElementById('auth-overlay').classList.add('hidden')
      document.getElementById('admin-ui').classList.remove('hidden')
      renderConfig(config)

    } catch (err) {
      showAuthError('Could not reach server.')
      document.getElementById('auth-btn').disabled = false
    }
  }

  function showAuthError(msg) {
    const el = document.getElementById('auth-error')
    el.textContent = msg
    el.classList.remove('hidden')
  }

  // ─── Render Config ──────────────────────────────────────────────────────────

  function renderConfig(cfg) {
    renderProviders('image-providers', cfg.imageProviders, IMAGE_MODELS, 'image')
    renderProviders('video-providers', cfg.videoProviders, VIDEO_MODELS, 'video')
  }

  function renderProviders(containerId, providers, modelsMap, type) {
    const container = document.getElementById(containerId)
    container.innerHTML = ''

    providers.forEach((provider, idx) => {
      const models = modelsMap[provider.name] || []
      const row = document.createElement('div')
      row.className = 'provider-row' + (provider.isActive ? ' active-provider' : '')
      row.id = `provider-row-${type}-${idx}`

      const modelOptions = models.map(m =>
        `<option value="${m.id}" ${provider.modelId === m.id ? 'selected' : ''}>${m.label}</option>`
      ).join('')

      // Add current modelId as custom option if not in known list
      const knownIds = models.map(m => m.id)
      const customOption = !knownIds.includes(provider.modelId) && provider.modelId
        ? `<option value="${provider.modelId}" selected>${provider.modelId} (custom)</option>`
        : ''

      row.innerHTML = `
        <div class="provider-toggle">
          <input type="radio" name="${type}-active" value="${idx}"
            ${provider.isActive ? 'checked' : ''}
            id="radio-${type}-${idx}">
        </div>
        <div class="provider-fields">
          <label for="radio-${type}-${idx}" class="provider-name">${provider.name}</label>
          <input
            type="password"
            placeholder="API Key"
            value="${provider.apiKey || ''}"
            data-field="apiKey"
            data-type="${type}"
            data-idx="${idx}"
            autocomplete="off"
          >
          <select data-field="modelId" data-type="${type}" data-idx="${idx}">
            ${customOption}
            ${modelOptions}
          </select>
          <div id="custom-model-${type}-${idx}" class="${isCustomModel(provider.modelId, models) ? '' : 'hidden'}">
            <input
              type="text"
              placeholder="Custom model ID / version hash"
              value="${isCustomModel(provider.modelId, models) ? provider.modelId : ''}"
              data-field="customModelId"
              data-type="${type}"
              data-idx="${idx}"
            >
          </div>
        </div>
      `

      container.appendChild(row)
    })

    // Wire up radio buttons
    container.querySelectorAll(`input[name="${type}-active"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        container.querySelectorAll('.provider-row').forEach((r, i) => {
          r.classList.toggle('active-provider', i === parseInt(radio.value))
        })
      })
    })

    // Wire up model selects to show/hide custom field
    container.querySelectorAll(`select[data-field="modelId"]`).forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = sel.dataset.idx
        const type = sel.dataset.type
        const customDiv = document.getElementById(`custom-model-${type}-${idx}`)
        if (sel.value === 'custom') {
          customDiv.classList.remove('hidden')
        } else {
          customDiv.classList.add('hidden')
        }
      })
    })
  }

  function isCustomModel(modelId, knownModels) {
    if (!modelId) return false
    return !knownModels.some(m => m.id === modelId) && modelId !== 'custom'
  }

  // ─── Save Config ────────────────────────────────────────────────────────────

  document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    document.getElementById('save-error').classList.add('hidden')
    document.getElementById('save-success').classList.add('hidden')
    document.getElementById('save-btn').disabled = true
    document.getElementById('save-btn').textContent = 'Saving...'

    const newConfig = collectConfig()

    try {
      const res = await fetch('/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify(newConfig)
      })

      const data = await res.json()

      if (!res.ok) {
        document.getElementById('save-error').textContent = data.error || 'Save failed.'
        document.getElementById('save-error').classList.remove('hidden')
      } else {
        config = newConfig
        document.getElementById('save-success').classList.remove('hidden')
      }
    } catch (err) {
      document.getElementById('save-error').textContent = 'Could not reach server.'
      document.getElementById('save-error').classList.remove('hidden')
    }

    document.getElementById('save-btn').disabled = false
    document.getElementById('save-btn').textContent = 'Save Configuration'
  })

  function collectConfig() {
    const result = { imageProviders: [], videoProviders: [] }

    ;['image', 'video'].forEach(type => {
      const providers = type === 'image' ? config.imageProviders : config.videoProviders
      const activeRadio = document.querySelector(`input[name="${type}-active"]:checked`)
      const activeIdx = activeRadio ? parseInt(activeRadio.value) : 0

      providers.forEach((provider, idx) => {
        const container = document.getElementById(`provider-row-${type}-${idx}`)
        const apiKeyEl = container.querySelector(`[data-field="apiKey"]`)
        const modelSelEl = container.querySelector(`[data-field="modelId"]`)
        const customModelEl = container.querySelector(`[data-field="customModelId"]`)

        let modelId = modelSelEl ? modelSelEl.value : provider.modelId
        if (modelId === 'custom' && customModelEl) {
          modelId = customModelEl.value.trim() || provider.modelId
        }

        const updated = {
          name: provider.name,
          apiKey: apiKeyEl ? apiKeyEl.value.trim() : provider.apiKey,
          modelId,
          isActive: idx === activeIdx
        }

        if (type === 'image') result.imageProviders.push(updated)
        else result.videoProviders.push(updated)
      })
    })

    return result
  }
})()
