"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

export function MagneticButton({ className, ...props }: ButtonProps) {
  return <Button data-magnetic className={cn("magnet-control", className)} {...props} />
}

export function MagneticLink({
  className,
  href,
  children,
}: {
  className?: string
  href: string
  children: React.ReactNode
}) {
  return (
    <a href={href} data-magnetic className={cn(buttonVariants(), "magnet-control inline-flex", className)}>
      {children}
    </a>
  )
}
