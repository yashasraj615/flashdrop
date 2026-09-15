import { defineConfig } from "@neon/config/v1"

export default defineConfig({
  preview: {
    buckets: {
      "temporary-files": { access: "private" },
    },
    functions: {
      cleanup: {
        name: "expired file cleanup",
        source: "functions/cleanup.ts",
      },
    },
  },
})
