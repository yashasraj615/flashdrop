import { readFileSync } from "node:fs"
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"

function loadEnv() {
  const env = {}
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1)
  }
  return env
}

const env = loadEnv()
const client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

await client.send(
  new PutBucketCorsCommand({
    Bucket: env.NEON_STORAGE_BUCKET || "temporary-files",
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
          AllowedOrigins: ["*"],
          ExposeHeaders: ["ETag", "etag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
)

console.log("bucket CORS configured")
