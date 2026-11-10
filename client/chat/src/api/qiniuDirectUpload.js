// Browser-to-Qiniu (Kodo) multipart upload v2 for shared files.
//
// Flow:
//   1. POST /api/files/direct-upload/init      → upload ticket + Kodo upload token
//   2. Kodo: initiate multipart → PUT each part → complete
//   3. POST /api/files/direct-upload/complete  → server verifies on Kodo, saves the row
//
// File bytes go straight to Kodo, so Nginx/Node body limits do not apply.
// Progress of finished parts is kept in localStorage, so picking the same file
// again after a failure, refresh, or network loss resumes instead of restarting.
//
// Docs: https://developer.qiniu.com/kodo/6364/multipartupload-interface

const BASE = import.meta.env.VITE_API_BASE || ''
const MiB = 1024 * 1024
const MIN_PART_SIZE = 8 * MiB          // Kodo requires ≥ 1 MiB for every part except the last
const MAX_PARTS = 10000                // Kodo hard limit per multipart upload
const TARGET_MAX_PARTS = 9000          // keep a margin below MAX_PARTS
const CONCURRENCY = 3
const PART_RETRIES = 3
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000
const RESUME_PREFIX = 'nodex-direct-upload:'
const RESUME_MAX_AGE_MS = 6 * 24 * 3600 * 1000 // Kodo drops unfinished uploadIds after 7 days

export class DirectUploadUnavailableError extends Error {
  constructor(message) {
    super(message || 'Direct upload is unavailable')
    this.code = 'direct_upload_unavailable'
  }
}

function getToken() {
  return localStorage.getItem('nodex-token') || ''
}

async function apiPost(path, body, signal) {
  const t = getToken()
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {})
    },
    body: JSON.stringify(body || {}),
    signal
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) {
    const err = new Error(data.error?.message || 'Request failed')
    err.code = data.error?.code
    err.status = res.status
    throw err
  }
  return data.data
}

function partSizeFor(size) {
  return Math.max(MIN_PART_SIZE, Math.ceil(size / TARGET_MAX_PARTS / MiB) * MiB)
}

function resumeKey(file) {
  return RESUME_PREFIX + [file.name, file.size, file.lastModified].join('|')
}

function loadResume(file) {
  try {
    const raw = localStorage.getItem(resumeKey(file))
    if (!raw) return null
    const state = JSON.parse(raw)
    if (!state || !state.ticket || !state.uploadId || Date.now() - state.startedAt > RESUME_MAX_AGE_MS) {
      localStorage.removeItem(resumeKey(file))
      return null
    }
    return state
  } catch {
    return null
  }
}

function saveResume(file, state) {
  try { localStorage.setItem(resumeKey(file), JSON.stringify(state)) } catch {}
}

function clearResume(file) {
  try { localStorage.removeItem(resumeKey(file)) } catch {}
}

function kodoError(xhrOrRes, text) {
  let message = `Qiniu upload failed (HTTP ${xhrOrRes.status})`
  try {
    const body = JSON.parse(text)
    if (body && body.error) message = `Qiniu: ${body.error}`
  } catch {}
  const err = new Error(message)
  err.status = xhrOrRes.status
  return err
}

function isAbort(err) {
  return err && (err.name === 'AbortError' || err.code === 'aborted')
}

function abortError() {
  const err = new Error('Upload cancelled')
  err.name = 'AbortError'
  err.code = 'aborted'
  return err
}

/**
 * Upload one shared file straight to Qiniu.
 *
 * @param {File} file
 * @param {{ onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<object>} the saved file record, same shape as /api/files/upload
 * @throws {DirectUploadUnavailableError} when shared files are not stored in Qiniu
 */
export async function uploadShareFileDirect(file, { onProgress, signal } = {}) {
  if (signal?.aborted) throw abortError()

  let session = null
  const resumed = loadResume(file)
  if (resumed) {
    try {
      const { token, tokenExpiresAt } = await apiPost(
        '/api/files/direct-upload/token', { ticket: resumed.ticket }, signal
      )
      session = { ...resumed, token, tokenExpiresAt }
    } catch (err) {
      if (isAbort(err)) throw err
      clearResume(file)
    }
  }

  if (!session) {
    let init
    try {
      init = await apiPost('/api/files/direct-upload/init', {
        filename: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream'
      }, signal)
    } catch (err) {
      if (err.code === 'direct_upload_unavailable' || err.status === 404) {
        throw new DirectUploadUnavailableError(err.message)
      }
      throw err
    }
    session = {
      ticket: init.ticket,
      uploadHost: init.uploadHost,
      bucket: init.bucket,
      encodedKey: init.encodedKey,
      token: init.token,
      tokenExpiresAt: init.tokenExpiresAt,
      partSize: partSizeFor(file.size),
      uploadId: null,
      parts: {},
      startedAt: Date.now()
    }
  }

  const objectUrl = `${session.uploadHost}/buckets/${encodeURIComponent(session.bucket)}/objects/${session.encodedKey}/uploads`

  async function ensureToken() {
    if (session.tokenExpiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return
    const { token, tokenExpiresAt } = await apiPost(
      '/api/files/direct-upload/token', { ticket: session.ticket }, signal
    )
    session.token = token
    session.tokenExpiresAt = tokenExpiresAt
  }

  async function kodoFetch(url, init) {
    await ensureToken()
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `UpToken ${session.token}` },
      signal
    })
    const text = await res.text()
    if (!res.ok) throw kodoError(res, text)
    return text ? JSON.parse(text) : {}
  }

  // 1. Initiate the multipart upload (or keep the resumed one).
  if (!session.uploadId) {
    const { uploadId } = await kodoFetch(objectUrl, { method: 'POST' })
    session.uploadId = uploadId
    session.parts = {}
    saveResume(file, session)
  }

  const partSize = session.partSize
  const partCount = Math.max(1, Math.ceil(file.size / partSize))
  if (partCount > MAX_PARTS) throw new Error('File is too large to upload')

  // Progress bookkeeping: finished parts plus in-flight bytes.
  const inflight = new Map()
  let finishedBytes = 0
  for (const n of Object.keys(session.parts)) {
    const idx = Number(n) - 1
    finishedBytes += Math.min(partSize, file.size - idx * partSize)
  }
  const report = () => {
    let loaded = finishedBytes
    for (const v of inflight.values()) loaded += v
    onProgress?.(Math.min(loaded, file.size), file.size)
  }
  report()

  function putPart(partNumber) {
    const start = (partNumber - 1) * partSize
    const blob = file.slice(start, Math.min(start + partSize, file.size))
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const onAbort = () => xhr.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      xhr.open('PUT', `${objectUrl}/${session.uploadId}/${partNumber}`)
      xhr.setRequestHeader('Authorization', `UpToken ${session.token}`)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        inflight.set(partNumber, e.loaded)
        report()
      }
      xhr.onload = () => {
        signal?.removeEventListener('abort', onAbort)
        inflight.delete(partNumber)
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText).etag)
          } catch {
            reject(new Error('Invalid Qiniu part response'))
          }
        } else {
          reject(kodoError(xhr, xhr.responseText))
        }
      }
      xhr.onerror = () => {
        signal?.removeEventListener('abort', onAbort)
        inflight.delete(partNumber)
        reject(new Error('Network error while uploading to Qiniu'))
      }
      xhr.onabort = () => {
        signal?.removeEventListener('abort', onAbort)
        inflight.delete(partNumber)
        reject(abortError())
      }
      xhr.send(blob)
    })
  }

  async function uploadPartWithRetry(partNumber) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortError()
      await ensureToken()
      try {
        const etag = await putPart(partNumber)
        session.parts[partNumber] = etag
        finishedBytes += Math.min(partSize, file.size - (partNumber - 1) * partSize)
        saveResume(file, session)
        report()
        return
      } catch (err) {
        if (isAbort(err)) throw err
        // 612: uploadId no longer exists; restarting is the only option.
        if (err.status === 612) {
          clearResume(file)
          throw new Error('The upload session expired on Qiniu. Please upload the file again.')
        }
        const retriable = !err.status || err.status >= 500 || err.status === 401 || err.status === 408
        if (!retriable || attempt >= PART_RETRIES) throw err
        if (err.status === 401) session.tokenExpiresAt = 0 // force a token refresh
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }
  }

  // 2. Upload the missing parts with bounded concurrency.
  const pending = []
  for (let n = 1; n <= partCount; n++) if (!session.parts[n]) pending.push(n)
  let cursor = 0
  let failure = null
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (!failure && cursor < pending.length) {
      const n = pending[cursor++]
      try {
        await uploadPartWithRetry(n)
      } catch (err) {
        failure = failure || err
      }
    }
  })
  await Promise.all(workers)
  if (failure) throw failure

  // 3. Assemble the object on Kodo.
  const parts = []
  for (let n = 1; n <= partCount; n++) parts.push({ partNumber: n, etag: session.parts[n] })
  try {
    await kodoFetch(`${objectUrl}/${session.uploadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts,
        fname: file.name,
        // Omit when unknown so Kodo detects the type from the content.
        ...(file.type ? { mimeType: file.type } : {})
      })
    })
  } catch (err) {
    // 612 after a previous successful complete: the object already exists.
    if (err.status !== 612) throw err
  }

  // 4. Register the file with our server, which verifies it on Kodo first.
  const saved = await apiPost('/api/files/direct-upload/complete', { ticket: session.ticket }, signal)
  clearResume(file)
  onProgress?.(file.size, file.size)
  return saved
}
