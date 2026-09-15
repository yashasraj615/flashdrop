import type { NextConfig } from "next"

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), gyroscope=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "*": [".env.local", ".env*.local"],
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
