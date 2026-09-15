const MANAGE_PREFIX = "flashdrop:manage:"

export function transferShareUrl(token: string, secret: string, origin = "") {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "")
  return `${base}/t/${token}#${secret}`
}

export function readHashSecret() {
  if (typeof window === "undefined") return null
  const hash = window.location.hash.replace(/^#/, "").trim()
  return hash || null
}

export function storeManageToken(token: string, manageToken: string) {
  try {
    localStorage.setItem(`${MANAGE_PREFIX}${token}`, manageToken)
  } catch {
    // Private mode may block storage; owner features then stay session-only.
  }
}

export function readManageToken(token: string) {
  try {
    return localStorage.getItem(`${MANAGE_PREFIX}${token}`)
  } catch {
    return null
  }
}

export function clearManageToken(token: string) {
  try {
    localStorage.removeItem(`${MANAGE_PREFIX}${token}`)
  } catch {
    // ignore
  }
}
