/* Local-only storage worker. Payloads never enter Flashdrop HTTP endpoints.
 * Acknowledgement is returned only after payload + checkpoint are flushed.
 * One writer per session/file; a second tab receives a lock error.
 */
let root, session, manifest
const handles = new Map()
let queue = Promise.resolve()
const empty = "0".repeat(64)
const hex = (b) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join("")
const hash = async (b) => hex(await crypto.subtle.digest("SHA-256", b))
async function open(index) {
  if (handles.has(index)) return handles.get(index)
  if (!manifest[index]) throw Error("Unknown file.")
  const file = await root.getFileHandle(`data-${index}`, { create: true })
  const data = await file.createSyncAccessHandle()
  let meta
  try {
    meta = await (
      await root.getFileHandle(`state-${index}`, { create: true })
    ).createSyncAccessHandle()
  } catch (e) {
    data.close()
    throw e
  }
  const bytes = new Uint8Array(meta.getSize())
  meta.read(bytes)
  let state = { offset: 0, chain: empty }
  try {
    state = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    /* Missing/torn checkpoint means restart this file. */
  }
  if (
    !Number.isSafeInteger(state.offset) ||
    state.offset < 0 ||
    state.offset > manifest[index].size ||
    state.offset > data.getSize() ||
    (state.offset !== manifest[index].size && state.offset % 12288 !== 0) ||
    !/^[a-f0-9]{64}$/.test(state.chain)
  )
    state = { offset: 0, chain: empty }
  // Discard data beyond the last checkpoint; a crash between flushes is safe.
  data.truncate(state.offset)
  const value = { data, meta, state }
  handles.set(index, value)
  return value
}
function checkpoint(h) {
  const b = new TextEncoder().encode(JSON.stringify(h.state))
  h.meta.truncate(0)
  if (h.meta.write(b, { at: 0 }) !== b.length)
    throw Error("Local checkpoint could not be written.")
  h.meta.flush()
}
async function verify(h) {
  let chain = empty
  for (let offset = 0; offset < h.state.offset; offset += 12288) {
    const b = new Uint8Array(Math.min(12288, h.state.offset - offset))
    if (h.data.read(b, { at: offset }) !== b.length)
      throw Error(
        "Retained local bytes are incomplete. Reset pairing to restart."
      )
    chain = await hash(new TextEncoder().encode(`${chain}:${await hash(b)}`))
  }
  if (chain !== h.state.chain)
    throw Error(
      "Retained local bytes failed integrity verification. Reset pairing to restart."
    )
}
async function run(m) {
  if (m.action === "init") {
    session = m.session
    manifest = m.files
    const base = await navigator.storage.getDirectory()
    root = await base.getDirectoryHandle(`flashdrop-${session}`, {
      create: true,
    })
    return true
  }
  if (m.action === "state") {
    const h = await open(m.index)
    await verify(h)
    return h.state
  }
  if (m.action === "chunk") {
    const h = await open(m.index),
      bytes = new Uint8Array(m.bytes)
    if (
      bytes.length > 12288 ||
      !bytes.length ||
      m.offset !== h.state.offset ||
      m.offset + bytes.length > manifest[m.index].size
    )
      throw Error("Unexpected chunk offset. Reconnect to reconcile progress.")
    if ((await hash(bytes)) !== m.hash)
      throw Error("Integrity verification failed. Retry the transfer.")
    if (h.data.write(bytes, { at: m.offset }) !== bytes.length)
      throw Error("Local disk write was incomplete. Free space and retry.")
    h.data.flush()
    h.state = {
      verified: false,
      offset: m.offset + bytes.length,
      chain: await hash(new TextEncoder().encode(`${h.state.chain}:${m.hash}`)),
    }
    checkpoint(h)
    return h.state
  }
  if (m.action === "finish") {
    const h = await open(m.index)
    if (h.state.offset !== manifest[m.index].size || h.state.chain !== m.chain)
      throw Error("File verification failed. Keep the source and retry.")
    await verify(h)
    h.state.verified = true
    checkpoint(h)
    const state = h.state
    h.data.close()
    h.meta.close()
    handles.delete(m.index)
    return state
  }
  if (m.action === "close") {
    for (const h of handles.values()) {
      h.data.close()
      h.meta.close()
    }
    handles.clear()
    return true
  }
  throw Error("Unknown storage operation.")
}
onmessage = (e) => {
  queue = queue.then(async () => {
    try {
      postMessage({ id: e.data.id, value: await run(e.data) })
    } catch (error) {
      postMessage({
        id: e.data.id,
        error:
          error.message ||
          "Local storage is unavailable. Free disk space and retry.",
      })
    }
  })
}
