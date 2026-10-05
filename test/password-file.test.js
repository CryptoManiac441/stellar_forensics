import test from "node:test";
import assert from "node:assert/strict";
import { parsePasswordCandidates, parsePasswordFile } from "../src/passwords.js";

test("explicit --password-file contents use each non-comment line as a password", () => {
  assert.deepEqual(parsePasswordFile("hunter2\n"), ["hunter2"]);
  assert.deepEqual(
    parsePasswordFile("open-sesame\npassword: labeled\n# comment\n\n"),
    ["open-sesame", "labeled"]
  );
  assert.deepEqual(parsePasswordFile("'quoted-pass'\n"), ["quoted-pass"]);
});

test("opportunistic disk search still ignores unlabeled lines", () => {
  assert.deepEqual(parsePasswordCandidates("hunter2\npassword: labeled\n"), ["labeled"]);
});
