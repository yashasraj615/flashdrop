const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/

export function isPlausibleToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

export function tokenPreview(token: string): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}
