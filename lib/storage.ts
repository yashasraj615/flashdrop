import "server-only"

import { randomUUID } from "node:crypto"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS } from "@/lib/constants"
import { requireEnv, storageBucket } from "@/lib/env"
import { contentDisposition } from "@/lib/filenames"

let client: S3Client | null = null

export function getStorage() {
  if (!client) {
    client = new S3Client({
      region: requireEnv("AWS_REGION"),
      endpoint: requireEnv("AWS_ENDPOINT_URL_S3"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
    })
  }
  return client
}

export function createObjectKey() {
  return `uploads/${randomUUID()}`
}

export async function createMultipartUpload(input: { key: string; contentType: string }) {
  const result = await getStorage().send(
    new CreateMultipartUploadCommand({
      Bucket: storageBucket(),
      Key: input.key,
      ContentType: input.contentType,
      ContentDisposition: "attachment",
    })
  )
  if (!result.UploadId) throw new Error("Could not start multipart upload")
  return result.UploadId
}

export async function signedPutUrl(input: { key: string; contentType: string }) {
  return getSignedUrl(
    getStorage(),
    new PutObjectCommand({
      Bucket: storageBucket(),
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  )
}

export async function signedPartUrl(input: { key: string; uploadId: string; partNumber: number }) {
  return getSignedUrl(
    getStorage(),
    new UploadPartCommand({
      Bucket: storageBucket(),
      Key: input.key,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  )
}

export async function completeMultipartUpload(input: {
  key: string
  uploadId: string
  parts: { partNumber: number; etag: string }[]
}) {
  const parts = [...input.parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((part) => ({
      PartNumber: part.partNumber,
      ETag: part.etag.startsWith('"') ? part.etag : `"${part.etag}"`,
    }))

  await getStorage().send(
    new CompleteMultipartUploadCommand({
      Bucket: storageBucket(),
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: { Parts: parts },
    })
  )
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await getStorage().send(
    new AbortMultipartUploadCommand({
      Bucket: storageBucket(),
      Key: key,
      UploadId: uploadId,
    })
  )
}

export async function listUploadedPartNumbers(key: string, uploadId: string) {
  const numbers: number[] = []
  let marker: string | undefined
  do {
    const result = await getStorage().send(
      new ListPartsCommand({
        Bucket: storageBucket(),
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      })
    )
    for (const part of result.Parts ?? []) {
      if (part.PartNumber) numbers.push(part.PartNumber)
    }
    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined
  } while (marker)
  return numbers
}

export async function headObject(key: string) {
  const result = await getStorage().send(
    new HeadObjectCommand({
      Bucket: storageBucket(),
      Key: key,
    })
  )
  return {
    size: result.ContentLength ?? 0,
    contentType: result.ContentType ?? "application/octet-stream",
  }
}

export async function objectExists(key: string) {
  try {
    await headObject(key)
    return true
  } catch {
    return false
  }
}

export async function deleteObject(key: string) {
  await getStorage().send(
    new DeleteObjectCommand({
      Bucket: storageBucket(),
      Key: key,
    })
  )
}

export async function signedDownloadUrl(input: {
  key: string
  filename: string
  contentType: string
}) {
  return getSignedUrl(
    getStorage(),
    new GetObjectCommand({
      Bucket: storageBucket(),
      Key: input.key,
      ResponseContentDisposition: contentDisposition(input.filename),
      ResponseContentType: input.contentType,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
  )
}

export async function configureBucketCors(origins: string[]) {
  await getStorage().send(
    new PutBucketCorsCommand({
      Bucket: storageBucket(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
            AllowedOrigins: origins.length ? origins : ["*"],
            ExposeHeaders: ["ETag", "etag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  )
}
