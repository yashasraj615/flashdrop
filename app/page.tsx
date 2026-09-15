import { SiteShell } from "@/components/site-shell"
import { UploadExperience } from "@/components/upload-experience"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"

export default function HomePage() {
  return (
    <SiteShell>
      <section className="mx-auto flex w-full max-w-xl flex-col gap-8 pt-6 sm:pt-14">
        <div className="text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            {APP_NAME}
          </p>
          <h1 className="font-heading mt-4 text-4xl tracking-tight text-balance sm:text-6xl">
            Send files.
            <br />
            Simply.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground text-pretty sm:text-base">
            {APP_DESCRIPTION}
          </p>
        </div>
        <UploadExperience />
      </section>
    </SiteShell>
  )
}
