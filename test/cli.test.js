import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { extractFromBuffer, EXTRACTOR_REGISTRY, SUPPORTED_CARRIERS } from "../src/extractors.js";
import { environmentPasswordCandidates, parsePasswordCandidates } from "../src/passwords.js";
import { groupCandidates, horizonFailureStatus, isArchiveSignature, parseArgs } from "../src/cli.js";

const execFileAsync = promisify(execFile);

test("Stellar SDK derives a stable public key from a secret", () => {
  const secret = "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  assert.throws(() => Keypair.fromSecret(secret));
});

test("a generated keypair derives its matching public key", () => {
  const keypair = Keypair.random();
  assert.equal(Keypair.fromSecret(keypair.secret()).publicKey(), keypair.publicKey());
});

test("extractor registry covers the documented carrier classes", () => {
  assert.deepEqual(SUPPORTED_CARRIERS, ["text", "base64", "hex", "appended-data", "png", "jpeg", "wav", "gzip", "deflate", "brotli"]);
  assert.deepEqual(EXTRACTOR_REGISTRY.map((extractor) => extractor.name), [
    "raw-bytes", "encoded-payloads", "png-chunks", "jpeg-segments", "wav-chunks"
  ]);
});

test("extractors find direct, base64, hex, and appended secrets with provenance", async () => {
  const secret = Keypair.random().secret();
  const encoded = Buffer.from(secret).toString("base64");
  const hex = Buffer.from(secret).toString("hex");
  const buffer = Buffer.from(`plain ${secret} ${encoded} ${hex} STELLAR_FORensics_PAYLOAD ${secret}`);
  const results = await extractFromBuffer(buffer, "fixture.bin");
  assert.deepEqual([...new Set(results.map((result) => result.secret_key))], [secret]);
  assert.ok(results.some((result) => result.extractor === "raw-bytes"));
  assert.ok(results.some((result) => result.extractor === "base64"));
  assert.ok(results.some((result) => result.extractor === "hex"));
  assert.ok(results.some((result) => result.extractor === "appended-data"));
  assert.ok(results.every((result) => result.source_path === "fixture.bin"));
});

test("PNG, JPEG, and WAV metadata carriers are inspected", async () => {
  const secret = Keypair.random().secret();
  const pngData = Buffer.from(`Comment\0${secret}`);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("tEXt", pngData),
    chunk("IEND", Buffer.alloc(0))
  ]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xfe, Buffer.from(secret)), Buffer.from([0xff, 0xd9])]);
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE"), chunkLE("LIST", Buffer.from(secret))]);
  for (const [buffer, extractor] of [[png, "png-chunk"], [jpeg, "jpeg-segment"], [wav, "wav-chunk"]]) {
    assert.ok((await extractFromBuffer(buffer, `${extractor}.bin`)).some((result) => result.secret_key === secret && result.extractor === extractor));
  }
});

test("compressed payloads are decompressed and scanned", async () => {
  const secret = Keypair.random().secret();
  for (const [buffer, prefix] of [[gzipSync(Buffer.from(secret)), "gzip"], [brotliCompressSync(Buffer.from(secret)), "brotli"]]) {
    assert.ok((await extractFromBuffer(buffer, "payload.bin")).some((result) => result.secret_key === secret && result.extractor.startsWith(prefix)));
  }
});

test("nested decoded payloads preserve their carrier provenance", async () => {
  const secret = Keypair.random().secret();
  const encoded = Buffer.from(secret).toString("base64");
  const results = await extractFromBuffer(gzipSync(Buffer.from(encoded)), "carrier.gz");
  const match = results.find((result) => result.secret_key === secret && result.extractor.includes("base64"));
  assert.ok(match);
  assert.equal(match.source_path, "carrier.gz [gzip]");
});

test("password candidates come from labeled files and environment variables", () => {
  assert.deepEqual(parsePasswordCandidates("password: alpha\npassphrase = 'beta'\nnot-a-password: gamma"), ["alpha", "beta"]);
  assert.deepEqual(environmentPasswordCandidates({
    ARCHIVE_PASSWORD: "alpha",
    PATH: "ignored",
    STELLAR_PASSPHRASE: "beta"
  }), ["alpha", "beta"]);
});

test("scan candidates become structured Horizon-ready records", () => {
  const secret = Keypair.random().secret();
  const records = groupCandidates([
    { secret_key: secret, source_path: "C:\\carrier.png", discovery_method: "png-chunk" },
    { secret_key: secret, source_path: "C:\\archive.zip::keys.txt", discovery_method: "archive/raw-bytes" }
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].secret_key, secret);
  assert.deepEqual(records[0].source_paths, ["C:\\carrier.png", "C:\\archive.zip::keys.txt"]);
  assert.deepEqual(records[0].discovery_methods, ["png-chunk", "archive/raw-bytes"]);
});

test("Horizon failures have distinct statuses", () => {
  assert.equal(horizonFailureStatus({ response: { status: 429 } }), "horizon_rate_limited");
  assert.equal(horizonFailureStatus({ response: { status: 503 } }), "horizon_server_error");
  assert.equal(horizonFailureStatus({ code: "ETIMEDOUT" }), "horizon_timeout");
  assert.equal(horizonFailureStatus(new Error("offline")), "horizon_unavailable");
});

test("archive signatures are recognized from the scan header", () => {
  assert.equal(isArchiveSignature(Buffer.from("504b0304", "hex")), true);
  assert.equal(isArchiveSignature(Buffer.from("504b0506", "hex")), true);
  assert.equal(isArchiveSignature(Buffer.from("504b0708", "hex")), true);
  assert.equal(isArchiveSignature(Buffer.from("377abcaf271c", "hex")), true);
  assert.equal(isArchiveSignature(Buffer.from("526172211a07", "hex")), true);
  assert.equal(isArchiveSignature(Buffer.from("1f8b", "hex")), true);
  const tarHeader = Buffer.alloc(512);
  tarHeader.write("ustar", 257, "ascii");
  assert.equal(isArchiveSignature(tarHeader), true);
  assert.equal(isArchiveSignature(Buffer.from("00000000", "hex")), false);
});

test("password search requires an explicit scope", () => {
  assert.deepEqual(parseArgs(["scan", "--password-search", "containers"]).options["password-search"], "containers");
  assert.throws(() => parseArgs(["scan", "--password-search"]));
});

test("Node engine matches the upgraded Stellar SDK requirement", async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.engines.node, ">=22.12.0");
});

test("real ZIP containers feed extracted members into the extractor", async () => {
  const { path7za } = await import("7zip-bin");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-test-"));
  const member = path.join(root, "keys.txt");
  const archive = path.join(root, "keys.zip");
  const secret = Keypair.random().secret();
  try {
    await fs.writeFile(member, secret);
    await execFileAsync(path7za, ["a", "-tzip", archive, member], { windowsHide: true });
    const results = await extractFromBuffer(await fs.readFile(archive), archive);
    assert.ok(results.some((result) => result.secret_key === secret && result.source_path.includes("::keys.txt")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function chunkLE(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

function segment(marker, data) {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}
