(function () {
  const form = document.getElementById('generate-form')
  const promptEl = document.getElementById('prompt')
  const charCount = document.getElementById('char-count')
  const submitBtn = document.getElementById('submit-btn')
  const btnText = document.getElementById('btn-text')
  const btnSpinner = document.getElementById('btn-spinner')
  const errorMsg = document.getElementById('error-msg')

  promptEl.addEventListener('input', () => {
    charCount.textContent = promptEl.value.length
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorMsg.classList.add('hidden')

    const prompt = promptEl.value.trim()
    const duration = document.getElementById('duration').value
    const quality = document.getElementById('quality').value

    if (prompt.length < 10) {
      showError('Please enter a longer description (at least 10 characters).')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration: Number(duration), quality })
      })

      const data = await res.json()

      if (!res.ok) {
        showError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      window.location.href = `/result.html?jobId=${data.jobId}`
    } catch (err) {
      showError('Could not reach the server. Is it running?')
      setLoading(false)
    }
  })

  function setLoading(loading) {
    submitBtn.disabled = loading
    btnText.textContent = loading ? 'Starting...' : 'Generate Timelapse'
    btnSpinner.classList.toggle('hidden', !loading)
  }

  function showError(msg) {
    errorMsg.textContent = msg
    errorMsg.classList.remove('hidden')
  }
})()
