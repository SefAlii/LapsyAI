(function () {
  const params = new URLSearchParams(window.location.search)
  const jobId = params.get('jobId')

  if (!jobId) {
    window.location.href = '/'
    return
  }

  document.title = 'LapsyAI — Generating...'

  let pollInterval = null
  let lastStep = null

  function el(id) { return document.getElementById(id) }

  function setStep(name) {
    const stepMap = {
      scenes:   0,
      images:   1,
      video:    2,
      complete: 3
    }

    const idx = stepMap[name] ?? 0
    const stepEls = [
      el('step-scenes'),
      el('step-images'),
      el('step-video'),
      el('step-complete')
    ]

    stepEls.forEach((s, i) => {
      s.classList.remove('active', 'done')
      if (i < idx) s.classList.add('done')
      else if (i === idx) s.classList.add('active')
    })
  }

  function updateProgress(progress) {
    const { current, total } = progress
    if (total === 0) return

    const pct = Math.round((current / total) * 100)
    el('progress-fill').style.width = pct + '%'
    el('progress-text').textContent = `${current} / ${total} images`
    el('step-images-label').textContent = `Creating images (${current}/${total})`
    el('progress-section').classList.remove('hidden')
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderScenes(scenes, imagePaths) {
    if (!scenes || scenes.length === 0) return

    const grid = el('scenes-grid')
    el('scenes-section').classList.remove('hidden')

    // State 1: add new scene cards with spinner + prompt text
    const existing = grid.querySelectorAll('.scene-thumb').length
    for (let i = existing; i < scenes.length; i++) {
      const scene = scenes[i]
      const thumb = document.createElement('div')
      thumb.className = 'scene-thumb loading'
      thumb.id = `scene-thumb-${i}`
      thumb.innerHTML = `
        <div class="scene-loading-inner">
          <div class="spinner"></div>
          <p class="scene-prompt">${escapeHtml(scene.image_prompt || '')}</p>
        </div>
        <div class="scene-num">Scene ${i + 1}</div>
      `
      grid.appendChild(thumb)
    }

    // State 2: image ready — replace with img + collapsed caption
    if (imagePaths && imagePaths.length > 0) {
      imagePaths.forEach((p, i) => {
        const thumb = el(`scene-thumb-${i}`)
        if (thumb && thumb.classList.contains('loading')) {
          const scene = scenes[i]
          const promptText = scene ? (scene.image_prompt || '') : ''
          const publicUrl = `/output/${jobId}/images/scene_${String(i + 1).padStart(3, '0')}.png`
          thumb.classList.remove('loading')
          thumb.innerHTML = `
            <img src="${publicUrl}" alt="Scene ${i + 1}" loading="lazy">
            <div class="scene-num">Scene ${i + 1}</div>
            <div class="scene-caption">
              <p class="scene-caption-text">${escapeHtml(promptText)}</p>
            </div>
          `
          thumb.querySelector('.scene-caption').addEventListener('click', function () {
            this.classList.toggle('expanded')
          })
        }
      })
    }
  }

  function markFailedScenes() {
    document.querySelectorAll('.scene-thumb.loading').forEach(thumb => {
      const numEl = thumb.querySelector('.scene-num')
      const numText = numEl ? numEl.textContent : ''
      thumb.classList.remove('loading')
      thumb.classList.add('error')
      thumb.innerHTML = `
        <div class="scene-error-label">Failed</div>
        <div class="scene-num">${numText}</div>
      `
    })
  }

  async function poll() {
    try {
      const res = await fetch(`/status/${jobId}`)
      if (!res.ok) {
        if (res.status === 404) {
          handleError('Job not found. It may have expired.')
          return
        }
        return
      }

      const data = await res.json()

      // Update step UI
      if (data.step !== lastStep) {
        setStep(data.step)
        lastStep = data.step
      }

      // Status banner
      const banner = el('status-banner')
      const statusText = el('status-text')

      if (data.status === 'failed') {
        handleError(data.error || 'Generation failed. Please try again.')
        return
      }

      if (data.status === 'processing' || data.status === 'pending') {
        const stepLabels = {
          scenes:   'Generating scenes with GPT-4o...',
          images:   `Creating images${data.progress?.total ? ` (${data.progress.current}/${data.progress.total})` : '...'}`,
          video:    'Assembling video...',
          complete: 'Finalizing...'
        }
        statusText.textContent = stepLabels[data.step] || 'Processing...'

        if (data.step === 'images') {
          updateProgress(data.progress || { current: 0, total: 0 })
        }

        if (data.scenes?.length > 0) {
          renderScenes(data.scenes, data.imagePaths)
        }
      }

      if (data.status === 'done' && data.videoUrl) {
        clearInterval(pollInterval)
        handleComplete(data)
      }

    } catch (err) {
      console.warn('Poll error:', err.message)
    }
  }

  function handleComplete(data) {
    document.title = 'LapsyAI — Done!'

    const banner = el('status-banner')
    banner.className = 'status-banner done mb-24'
    el('status-spinner').style.display = 'none'
    el('status-text').textContent = 'Your timelapse is ready!'

    el('page-title').textContent = 'Timelapse complete'
    el('page-subtitle').textContent = 'Your video is ready to watch and download.'

    setStep('complete')

    if (data.scenes?.length > 0) {
      renderScenes(data.scenes, data.imagePaths)
    }

    const videoEl = el('result-video')
    videoEl.src = data.videoUrl
    el('download-link').href = data.videoUrl

    el('video-section').classList.remove('hidden')
  }

  function handleError(message) {
    clearInterval(pollInterval)
    markFailedScenes()

    document.title = 'LapsyAI — Error'

    const banner = el('status-banner')
    banner.className = 'status-banner failed mb-24'
    el('status-spinner').style.display = 'none'
    el('status-text').textContent = 'Generation failed'

    el('error-text').textContent = message
    el('error-section').classList.remove('hidden')
    el('video-section').classList.add('hidden')
  }

  // Start polling immediately, then every 3 seconds
  poll()
  pollInterval = setInterval(poll, 3000)
})()
