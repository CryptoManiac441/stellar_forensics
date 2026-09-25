import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { walkExtractedMembers } from "../src/extractors.js";

test("archive member walk keeps secrets when a sibling symlink cannot be read", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-archive-walk-"));
  const secret = `S${"A".repeat(55)}`;
  try {
    await fs.mkdir(path.join(root, "target"));
    await fs.symlink(path.join(root, "target"), path.join(root, "aaa-link"));
    await fs.writeFile(path.join(root, "zzz-keys.txt"), secret);
    const results = await walkExtractedMembers(root, "carrier.zip", [], undefined, undefined, "");
    assert.ok(results.some((result) => result.secret_key === secret));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("one unreadable archive member does not drop secrets from siblings", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-archive-locked-"));
  const secret = `S${"B".repeat(55)}`;
  const events = [];
  try {
    const locked = path.join(root, "aaa-locked.bin");
    await fs.writeFile(locked, "not-readable");
    await fs.chmod(locked, 0);
    await fs.writeFile(path.join(root, "zzz-keys.txt"), secret);
    const results = await walkExtractedMembers(
      root,
      "carrier.zip",
      [],
      undefined,
      (details) => events.push(details),
      ""
    );
    assert.ok(results.some((result) => result.secret_key === secret));
    assert.ok(events.some((event) => event.status === "member_failed" && String(event.member).includes("aaa-locked.bin")));
  } finally {
    await fs.chmod(path.join(root, "aaa-locked.bin"), 0o644).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
