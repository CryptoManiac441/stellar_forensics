import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractFromBuffer } from "../src/extractors.js";
import { decodePasswordFileText, findPasswordCandidates, parsePasswordCandidates } from "../src/passwords.js";

const SECRET = "SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

test("UTF-16 LE text yields secret-key patterns that latin1 scanning misses", async () => {
  const notepad = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`saved ${SECRET}\r\n`, "utf16le")]);
  const results = await extractFromBuffer(notepad, "unicode.txt", { allowArchives: false });
  assert.ok(results.some((result) => result.secret_key === SECRET && result.extractor === "raw-bytes"));
  const oddAligned = Buffer.concat([Buffer.from("x"), Buffer.from(SECRET, "utf16le")]);
  assert.ok((await extractFromBuffer(oddAligned, "odd.bin", { allowArchives: false })).some((result) => result.secret_key === SECRET));
});

test("UTF-16 password files still yield labeled candidates", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-utf16-pw-"));
  const file = path.join(root, "passwords.txt");
  try {
    const payload = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("password: hunter2\r\n", "utf16le")]);
    assert.deepEqual(parsePasswordCandidates(decodePasswordFileText(payload)), ["hunter2"]);
    await fs.writeFile(file, payload);
    assert.deepEqual(await findPasswordCandidates({ files: [file] }), ["hunter2"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
