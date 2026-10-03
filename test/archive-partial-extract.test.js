import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractFromBuffer } from "../src/extractors.js";

const execFileAsync = promisify(execFile);
const SECRET = "SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

test("mixed-encryption ZIP still yields secrets from unencrypted members", async () => {
  const { path7za } = await import("7zip-bin");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-mixed-"));
  const plain = path.join(root, "keys.txt");
  const locked = path.join(root, "notes.txt");
  const archive = path.join(root, "mixed.zip");
  try {
    await fs.writeFile(plain, `${SECRET}\n`);
    await fs.writeFile(locked, "private notes\n");
    await execFileAsync(path7za, ["a", "-tzip", archive, plain], { windowsHide: true });
    await execFileAsync(path7za, ["a", "-tzip", "-plocked", archive, locked], { windowsHide: true });
    const results = await extractFromBuffer(await fs.readFile(archive), archive);
    assert.ok(
      results.some((result) => result.secret_key === SECRET && String(result.extractor).startsWith("archive/")),
      `expected archive extraction of unencrypted member, got ${JSON.stringify(results)}`
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a later correct password still extracts encrypted members", async () => {
  const { path7za } = await import("7zip-bin");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-mixed-pw-"));
  const plain = path.join(root, "keys.txt");
  const locked = path.join(root, "vault.txt");
  const archive = path.join(root, "mixed.zip");
  const lockedSecret = "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  try {
    await fs.writeFile(plain, `${SECRET}\n`);
    await fs.writeFile(locked, `${lockedSecret}\n`);
    await execFileAsync(path7za, ["a", "-tzip", archive, plain], { windowsHide: true });
    await execFileAsync(path7za, ["a", "-tzip", "-plocked", archive, locked], { windowsHide: true });
    const results = await extractFromBuffer(await fs.readFile(archive), archive, { passwords: ["locked"] });
    assert.ok(results.some((result) => result.secret_key === SECRET));
    assert.ok(
      results.some((result) => result.secret_key === lockedSecret && String(result.extractor).startsWith("archive/")),
      `expected encrypted member after correct password, got ${JSON.stringify(results)}`
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
