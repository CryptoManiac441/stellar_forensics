import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { extractFromBuffer } from "../src/extractors.js";

const SECRET = "SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function pngWith(textChunk) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    textChunk,
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("zTXt metadata yields secrets hidden by zlib compression", async () => {
  const payload = Buffer.concat([
    Buffer.from("Comment"),
    Buffer.from([0, 0]),
    deflateSync(Buffer.from(`wallet ${SECRET}`))
  ]);
  const results = await extractFromBuffer(pngWith(chunk("zTXt", payload)), "keys.png", { allowArchives: false });
  assert.ok(
    results.some((result) => result.secret_key === SECRET && result.extractor === "png-chunk"),
    `expected decompressed zTXt secret, got ${JSON.stringify(results)}`
  );
});

test("compressed iTXt metadata yields secrets hidden by zlib compression", async () => {
  const payload = Buffer.concat([
    Buffer.from("Comment"),
    Buffer.from([0, 1, 0]),
    Buffer.from("en"),
    Buffer.from([0]),
    Buffer.from("Comment"),
    Buffer.from([0]),
    deflateSync(Buffer.from(`wallet ${SECRET}`))
  ]);
  const results = await extractFromBuffer(pngWith(chunk("iTXt", payload)), "keys.png", { allowArchives: false });
  assert.ok(
    results.some((result) => result.secret_key === SECRET && result.extractor === "png-chunk"),
    `expected decompressed iTXt secret, got ${JSON.stringify(results)}`
  );
});

test("corrupt zTXt chunks are skipped instead of failing the scan", async () => {
  const payload = Buffer.concat([
    Buffer.from("Comment"),
    Buffer.from([0, 0]),
    Buffer.from("not-a-zlib-stream")
  ]);
  const results = await extractFromBuffer(pngWith(chunk("zTXt", payload)), "bad.png", { allowArchives: false });
  assert.equal(Array.isArray(results), true);
  assert.equal(results.some((result) => result.secret_key === SECRET), false);
});

test("uncompressed tEXt metadata still yields secrets", async () => {
  const payload = Buffer.from(`Comment\0${SECRET}`);
  const results = await extractFromBuffer(pngWith(chunk("tEXt", payload)), "keys.png", { allowArchives: false });
  assert.ok(results.some((result) => result.secret_key === SECRET && result.extractor === "png-chunk"));
});
