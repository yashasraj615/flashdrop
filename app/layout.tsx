import { Plus_Jakarta_Sans, IBM_Plex_Sans } from "next/font/google"
import type { Metadata, Viewport } from "next"

import "./globals.css"
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

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/icon-192.png" },
  },
}

export const viewport: Viewport = {
  themeColor: "#090b14",
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
            {children}
            <Toaster position="bottom-center" />
            <RegisterSw />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
