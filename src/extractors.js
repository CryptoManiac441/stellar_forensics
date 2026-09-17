import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { path7za as bundledSevenZipPath } from "7zip-bin";

const SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/g;

export const SUPPORTED_CARRIERS = [
  "text",
  "base64",
  "hex",
  "appended-data",
  "png",
  "jpeg",
  "wav",
  "gzip",
  "deflate",
  "brotli"
];

function strings(buffer) {
  return buffer.toString("latin1").match(SECRET_PATTERN) ?? [];
}
function unique(values) {
  return [...new Set(values)];
}

function payloadResult(secrets, extractor, details = {}) {
  return unique(secrets).map((secret) => ({
    secret_key: secret,
    extractor,
    ...details
  }));
}

function extractEncoded(buffer, onDecoded) {
  const text = buffer.toString("latin1");
  const results = [];
  for (const match of text.matchAll(/\b[A-Za-z0-9+/]{72,}={0,2}\b/g)) {
    try {
      const decoded = Buffer.from(match[0], "base64");
      onDecoded?.(decoded, { extractor: "base64", offset: match.index });
      results.push(...payloadResult(strings(decoded), "base64", {
        offset: match.index,
        encoding: "base64"
      }));
    } catch {
      // Candidate was not valid Base64.
    }
  }
  for (const match of text.matchAll(/\b[0-9a-fA-F]{112,}\b/g)) {
    try {
      const decoded = Buffer.from(match[0], "hex");
      onDecoded?.(decoded, { extractor: "hex", offset: match.index });
      results.push(...payloadResult(strings(decoded), "hex", {
        offset: match.index,
        encoding: "hex"
      }));
    } catch {
      // Candidate was not valid hexadecimal.
    }
  }
  return results;
}

function extractPng(buffer, onDecoded) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return [];
  const results = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      onDecoded?.(buffer.subarray(dataStart, dataEnd), { extractor: "png-chunk", chunk: type, offset: dataStart });
      results.push(...payloadResult(strings(buffer.subarray(dataStart, dataEnd)), "png-chunk", { chunk: type, offset: dataStart }));
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return results;
}

function extractJpeg(buffer, onDecoded) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return [];
  const results = [];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    const dataStart = offset + 4;
    const dataEnd = offset + 2 + length;
    if (dataEnd > buffer.length || length < 2) break;
    if (marker === 0xfe || (marker >= 0xe0 && marker <= 0xef)) {
      onDecoded?.(buffer.subarray(dataStart, dataEnd), { extractor: "jpeg-segment", marker: `0x${marker.toString(16)}`, offset: dataStart });
      results.push(...payloadResult(strings(buffer.subarray(dataStart, dataEnd)), "jpeg-segment", { marker: `0x${marker.toString(16)}`, offset: dataStart }));
    }
    offset = dataEnd;
  }
  return results;
}

function extractWav(buffer, onDecoded) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return [];
  const results = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) break;
    onDecoded?.(buffer.subarray(start, end), { extractor: "wav-chunk", chunk: type, offset: start });
    results.push(...payloadResult(strings(buffer.subarray(start, end)), "wav-chunk", { chunk: type, offset: start }));
    offset = end + (length % 2);
  }
  return results;
}

export const EXTRACTOR_REGISTRY = [
  { name: "raw-bytes", carrier: "text", extract: (buffer) => payloadResult(strings(buffer), "raw-bytes") },
  { name: "encoded-payloads", carrier: "base64/hex", extract: extractEncoded },
  { name: "png-chunks", carrier: "png", extract: extractPng },
  { name: "jpeg-segments", carrier: "jpeg", extract: extractJpeg },
  { name: "wav-chunks", carrier: "wav", extract: extractWav }
];

const execFileAsync = promisify(execFile);

export async function resolveSevenZipPath() {
  try {
    const executable = bundledSevenZipPath;
    if (!executable) return null;
    if (executable !== "7za" && process.platform !== "win32") {
      try {
        await fs.access(executable, fsConstants.X_OK);
      } catch {
        try {
          await fs.chmod(executable, 0o755);
        } catch {
          // execFile will surface EACCES if the binary remains non-executable.
        }
      }
    }
    return executable;
  } catch {
    return null;
  }
}

async function extractWithSevenZip(buffer, sourcePath, passwords, onDecoded, onArchiveEvent) {
  const executable = await resolveSevenZipPath();
  if (!executable) {
    onArchiveEvent?.({ source: sourcePath, status: "extractor_unavailable" });
    return [];
  }
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-"));
  const archivePath = path.join(temporaryRoot, (path.basename(sourcePath).replace(/[<>:"/\\|?*]/g, "_") || "carrier.bin"));
  const outputPath = path.join(temporaryRoot, "out");
  try {
    await fs.writeFile(archivePath, buffer);
    await fs.mkdir(outputPath);
    for (const password of ["", ...passwords]) {
      try {
        await execFileAsync(executable, ["x", archivePath, `-o${outputPath}`, "-y", password ? `-p${password}` : "-p"], { windowsHide: true });
        const results = [];
        async function walk(directory) {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const memberPath = path.join(directory, entry.name);
            if (entry.isDirectory()) await walk(memberPath);
            else {
              const memberBuffer = await fs.readFile(memberPath);
              onDecoded?.(memberBuffer, { extractor: "archive-member", source: `${sourcePath}::${path.relative(outputPath, memberPath)}` });
              const extracted = await extractFromBuffer(
                memberBuffer,
                `${sourcePath}::${path.relative(outputPath, memberPath)}`,
                { passwords, onDecoded }
              );
              results.push(...extracted.map((result) => ({
                ...result,
                extractor: `archive/${result.extractor}`,
                password_source: password ? "candidate" : "none"
              })));
            }
          }
        }
        await walk(outputPath);
        return results;
      } catch (error) {
        onArchiveEvent?.({
          source: sourcePath,
          status: "attempt_failed",
          error: error instanceof Error ? error.message : String(error),
          password_attempted: Boolean(password)
        });
        await fs.rm(outputPath, { recursive: true, force: true });
        await fs.mkdir(outputPath);
      }
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
  return [];
}

export async function extractFromBuffer(buffer, sourcePath, options = {}) {
  const results = EXTRACTOR_REGISTRY.flatMap((extractor) => extractor.extract(buffer, options.onDecoded));
  const compressed = [];
  const compressionAttempts = [
    ["gzip", () => gunzipSync(buffer)],
    ["deflate", () => inflateSync(buffer)],
    ["brotli", () => brotliDecompressSync(buffer)]
  ];
  for (const [compression, decompress] of compressionAttempts) {
    try {
      const decoded = decompress();
      options.onDecoded?.(decoded, { extractor: compression, source: sourcePath });
      compressed.push(...(await extractFromBuffer(decoded, `${sourcePath} [${compression}]`, options)).map((result) => ({
        ...result,
        extractor: `${compression}/${result.extractor}`
      })));
    } catch {
      // Most files are not in this compression format.
    }
  }
  const archiveResults = options.allowArchives === false
    ? []
    : await extractWithSevenZip(buffer, sourcePath, options.passwords ?? [], options.onDecoded, options.onArchiveEvent);
  if (buffer.includes(Buffer.from("STELLAR_FORensics_PAYLOAD"))) {
    const offset = buffer.indexOf(Buffer.from("STELLAR_FORensics_PAYLOAD"));
    results.push(...payloadResult(strings(buffer.subarray(offset)), "appended-data", { offset }));
  }
  return [...results, ...compressed, ...archiveResults]
    .map((result) => ({ ...result, source_path: result.source_path ?? sourcePath }));
}
