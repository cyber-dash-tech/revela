import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { basename, dirname, join, relative, resolve, sep } from "path"
import { gunzipSync, gzipSync } from "zlib"

export interface TarEntry {
  path: string
  bytes: Buffer
  mode?: number
  mtime?: number
}

const BLOCK_SIZE = 512

export function writeTarArchive(entries: TarEntry[], targetPath: string, gzip: boolean): void {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const normalized = safeArchivePath(entry.path)
    const bytes = entry.bytes
    const header = Buffer.alloc(BLOCK_SIZE, 0)
    writeString(header, 0, 100, normalized)
    writeOctal(header, 100, 8, entry.mode ?? 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, bytes.byteLength)
    writeOctal(header, 136, 12, Math.floor(entry.mtime ?? Date.now() / 1000))
    header.fill(0x20, 148, 156)
    header[156] = "0".charCodeAt(0)
    writeString(header, 257, 6, "ustar")
    writeString(header, 263, 2, "00")
    const checksum = header.reduce((sum, value) => sum + value, 0)
    writeOctal(header, 148, 8, checksum)
    chunks.push(header, bytes)
    const remainder = bytes.byteLength % BLOCK_SIZE
    if (remainder !== 0) chunks.push(Buffer.alloc(BLOCK_SIZE - remainder, 0))
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2, 0))
  const tar = Buffer.concat(chunks as any)
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, (gzip ? gzipSync(tar as any) : tar) as any)
}

export function readTarArchive(archivePath: string): TarEntry[] {
  const raw = readFileSync(archivePath)
  const bytes = (archivePath.endsWith(".gz") || archivePath.endsWith(".tgz") ? gunzipSync(raw as any) : raw) as Buffer
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + BLOCK_SIZE <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + BLOCK_SIZE)
    offset += BLOCK_SIZE
    if (header.every((value) => value === 0)) break
    const rawPath = readString(header, 0, 100)
    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 0)
    if (type === "5") {
      const dirPath = rawPath.replace(/\/+$/, "")
      if (dirPath) safeArchivePath(dirPath)
      offset += paddedSize(size)
      continue
    }
    const path = safeArchivePath(rawPath)
    if (type === "2") throw new Error(`Archive symlinks are not supported: ${path}`)
    if (type !== "0" && type !== "\0" && type !== "") {
      offset += paddedSize(size)
      continue
    }
    if (offset + size > bytes.byteLength) throw new Error(`Archive entry is truncated: ${path}`)
    entries.push({ path, bytes: bytes.subarray(offset, offset + size), mode: readOctal(header, 100, 8), mtime: readOctal(header, 136, 12) })
    offset += paddedSize(size)
  }
  return entries
}

export function collectDirectoryEntries(sourceDir: string, prefix = ""): TarEntry[] {
  const root = resolve(sourceDir)
  const entries: TarEntry[] = []
  walk(root)
  return entries.sort((a, b) => a.path.localeCompare(b.path))

  function walk(dir: string): void {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === ".DS_Store" || entry.startsWith(".")) continue
      const abs = join(dir, entry)
      const stat = lstatSync(abs)
      if (stat.isSymbolicLink()) throw new Error(`Design archives cannot include symlinks: ${abs}`)
      if (stat.isDirectory()) {
        walk(abs)
        continue
      }
      if (!stat.isFile()) continue
      const rel = relative(root, abs).split(sep).join("/")
      entries.push({
        path: safeArchivePath(prefix ? `${prefix}/${rel}` : rel),
        bytes: readFileSync(abs),
        mode: stat.mode & 0o777,
        mtime: Math.floor(stat.mtimeMs / 1000),
      })
    }
  }
}

export function extractEntriesToDirectory(entries: TarEntry[], targetDir: string): string[] {
  const root = resolve(targetDir)
  if (existsSync(root)) rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const files: string[] = []
  for (const entry of entries) {
    const rel = safeArchivePath(entry.path)
    const target = resolve(root, rel)
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Archive path escapes target directory: ${entry.path}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entry.bytes as any)
    files.push(rel)
  }
  return files.sort()
}

export function normalizePackageArchiveEntries(entries: TarEntry[]): TarEntry[] {
  const files = entries.filter((entry) => entry.path && !entry.path.endsWith("/"))
  if (files.some((entry) => basename(entry.path) === "DESIGN.md")) {
    if (files.some((entry) => entry.path === "DESIGN.md")) return files
    const top = commonTopLevel(files)
    if (top && files.some((entry) => entry.path === `${top}/DESIGN.md`)) {
      return files.map((entry) => ({ ...entry, path: entry.path.slice(top.length + 1) }))
    }
  }
  throw new Error("No DESIGN.md found in design archive")
}

function commonTopLevel(entries: TarEntry[]): string | null {
  const first = entries[0]?.path.split("/")[0]
  if (!first || first === entries[0]?.path) return null
  return entries.every((entry) => entry.path.startsWith(`${first}/`)) ? first : null
}

function safeArchivePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\.\/+/, "")
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`Invalid archive path: ${input}`)
  const parts = normalized.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid archive path: ${input}`)
  if (Buffer.byteLength(normalized) > 100) throw new Error(`Archive path is too long for v1 tar support: ${normalized}`)
  return normalized
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), "utf8")
}

function readString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? length : end).toString("utf8").trim()
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, "0").slice(0, length - 1)
  buffer.write(text, offset, length - 1, "ascii")
  buffer[offset + length - 1] = 0
}

function readOctal(buffer: Buffer, offset: number, length: number): number {
  const text = readString(buffer, offset, length).replace(/\0/g, "").trim()
  return text ? parseInt(text, 8) : 0
}

function paddedSize(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
}
