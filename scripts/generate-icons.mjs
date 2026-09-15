import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const header = Buffer.alloc(4)
  header.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([header, typeBuf, data, crcBuf])
}

function png(size, paint) {
  const raw = Buffer.alloc((size + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = paint(x, y, size)
      const i = row + 1 + x * 1
      void i
    }
  }
  const rgb = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1)
    rgb[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = paint(x, y, size)
      const i = row + 1 + x * 3
      rgb[i] = r
      rgb[i + 1] = g
      rgb[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rgb)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function paint(x, y, size) {
  const nx = (x + 0.5) / size
  const ny = (y + 0.5) / size
  const inBolt =
    (nx > 0.42 && nx < 0.58 && ny > 0.18 && ny < 0.52) ||
    (nx > 0.32 && nx < 0.7 && ny > 0.46 && ny < 0.58) ||
    (nx > 0.46 && nx < 0.62 && ny > 0.52 && ny < 0.82)
  if (inBolt) return [201, 183, 255]
  return [18, 20, 31]
}

const root = dirname(fileURLToPath(import.meta.url))
const dir = join(root, "../public/icons")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "icon-192.png"), png(192, paint))
writeFileSync(join(dir, "icon-512.png"), png(512, paint))
writeFileSync(join(root, "../public/icon.svg"), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="9" fill="#12141F"/>
  <path d="M18.2 6.4 9.8 16.8h6.1l-2.3 8.8 8.6-10.6h-6.2l2.2-8.6Z" fill="#C9B7FF"/>
</svg>
`)
