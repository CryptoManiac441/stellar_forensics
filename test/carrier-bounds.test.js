import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { extractFromBuffer, MAX_CARRIER_BYTES } from "../src/extractors.js";

test("gzip bombs are skipped instead of expanding until the process crashes", async () => {
  const inflatedSize = MAX_CARRIER_BYTES + 1024 * 1024;
  const bomb = gzipSync(Buffer.alloc(inflatedSize));
  assert.ok(bomb.length < 256 * 1024);
  const results = await extractFromBuffer(bomb, "bomb.gz");
  assert.equal(Array.isArray(results), true);
  assert.equal(results.some((result) => String(result.extractor).startsWith("gzip/")), false);
});

test("compact gzip carriers still yield embedded secret-key patterns", async () => {
  const secret = `S${"A".repeat(55)}`;
  const results = await extractFromBuffer(gzipSync(Buffer.from(secret)), "keys.gz");
  assert.ok(results.some((result) => result.secret_key === secret && result.extractor.startsWith("gzip/")));
});

test("plaintext secrets inside a tar image are visible without slurping the archive", async () => {
  const secret = `S${"B".repeat(55)}`;
  const tar = Buffer.alloc(1024);
  tar.write("ustar", 257, "ascii");
  tar.write(secret, 512, "ascii");
  const results = await extractFromBuffer(tar, "disk.ova", { allowArchives: false });
  assert.ok(results.some((result) => result.secret_key === secret && result.extractor === "raw-bytes"));
});
