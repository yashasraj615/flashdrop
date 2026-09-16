export const LIFETIME_OPTIONS = [
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 7200, label: "2 hours" },
  { seconds: 18000, label: "5 hours" },
] as const

export type LifetimeSeconds = (typeof LIFETIME_OPTIONS)[number]["seconds"]

export const DEFAULT_LIFETIME_SECONDS: LifetimeSeconds = 3600
export const MIN_LIFETIME_SECONDS: LifetimeSeconds = 300
export const MAX_LIFETIME_SECONDS: LifetimeSeconds = 18000

const ALLOWED = new Set<number>(LIFETIME_OPTIONS.map((option) => option.seconds))

export function isLifetimeSeconds(value: unknown): value is LifetimeSeconds {
  return typeof value === "number" && Number.isInteger(value) && ALLOWED.has(value)
}

export function parseLifetimeSeconds(value: unknown, fallback = DEFAULT_LIFETIME_SECONDS): LifetimeSeconds {
  const numeric = typeof value === "string" ? Number(value) : value
  return isLifetimeSeconds(numeric) ? numeric : fallback
}

export function requireLifetimeSeconds(value: unknown): LifetimeSeconds {
  const numeric = typeof value === "string" ? Number(value) : value
  if (!isLifetimeSeconds(numeric)) {
    throw new Error("Choose a transfer lifetime between 5 minutes and 5 hours.")
  }
  return numeric
}

export function lifetimeLabel(seconds: number) {
  return LIFETIME_OPTIONS.find((option) => option.seconds === seconds)?.label ?? "1 hour"
}
