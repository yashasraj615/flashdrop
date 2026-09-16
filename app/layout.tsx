import { Plus_Jakarta_Sans, IBM_Plex_Sans } from "next/font/google"
import type { Metadata, Viewport } from "next"

import "./globals.css"
import { CosmicShell } from "@/components/cosmic-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { RegisterSw } from "@/components/register-sw"
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants"
import { cn } from "@/lib/utils"

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-numeric",
  display: "swap",
})

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  metadataBase: new URL(siteUrl),
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    images: ["/og.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#04080d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark antialiased", plusJakarta.variable, plex.variable, "font-sans")}
    >
      <body>
        <ThemeProvider defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <CosmicShell>
              {children}
              <Toaster position="bottom-center" />
              <RegisterSw />
            </CosmicShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
