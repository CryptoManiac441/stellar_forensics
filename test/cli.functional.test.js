import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { resolveSevenZipPath } from "../src/extractors.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("src/cli.js");

async function runCli(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], {
      windowsHide: true,
      timeout: options.timeout ?? 30_000,
      env: options.env ?? process.env
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code === "ERR_SOCKET_TIMEOUT" || error.killed ? 124 : (error.code ?? 1),
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      error
    };
  }
}

test("CLI help and unknown commands match documented entrypoints", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /stellar-forensics scan/);
  assert.match(help.stdout, /--root DIRECTORY/);
  assert.match(help.stdout, /--file FILE/);
  const unknown = await runCli(["nope"]);
  assert.equal(unknown.code, 2);
});

test("scan rejects missing or combined scopes", async () => {
  const missing = await runCli(["scan"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /exactly one of --all-drives, --root DIRECTORY, or --file FILE/);
  const combined = await runCli(["scan", "--all-drives", "--root", os.tmpdir()]);
  assert.equal(combined.code, 1);
  assert.match(combined.stderr, /exactly one of --all-drives, --root DIRECTORY, or --file FILE/);
});

test("scan --root writes pipeline artifacts for a bounded fixture", async () => {
  const path7za = await resolveSevenZipPath();
  assert.ok(path7za);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-cli-"));
  const output = path.join(root, "secrets.txt");
  const sources = `${output}.sources.json`;
  const decoded = path.join(root, "decoded.jsonl");
  const log = path.join(root, "scan.log");
  const member = path.join(root, "member.txt");
  const archive = path.join(root, "keys.zip");
  const secret = Keypair.random().secret();
  try {
    await fs.writeFile(path.join(root, "plain.txt"), `found ${secret}\n`);
    await fs.writeFile(member, `archived ${secret}\n`);
    await execFileAsync(path7za, ["a", "-tzip", archive, member], { windowsHide: true });
    const result = await runCli([
      "scan",
      "--root", root,
      "--output", output,
      "--decoded-log", decoded,
      "--verbose",
      "--log", log
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Found 1 candidate\(s\)/);
    assert.deepEqual((await fs.readFile(output, "utf8")).trim().split("\n"), [secret]);
    const sourceRecords = JSON.parse(await fs.readFile(sources, "utf8"));
    assert.equal(sourceRecords.length, 1);
    assert.ok(sourceRecords[0].source_paths.some((sourcePath) => sourcePath.includes("plain.txt")));
    assert.ok(sourceRecords[0].source_paths.some((sourcePath) => sourcePath.includes("keys.zip::")));
    const logText = await fs.readFile(log, "utf8");
    assert.match(logText, /"event":"scan_started"/);
    assert.match(logText, /"event":"candidate_discovered"/);
    assert.match(await fs.readFile(decoded, "utf8"), /"source_path"/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scan --file inspects only the requested carrier", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-file-"));
  const wanted = path.join(root, "wanted.txt");
  const ignored = path.join(root, "ignored.txt");
  const output = path.join(root, "secrets.txt");
  const wantedSecret = Keypair.random().secret();
  const ignoredSecret = Keypair.random().secret();
  try {
    await fs.writeFile(wanted, wantedSecret);
    await fs.writeFile(ignored, ignoredSecret);
    const result = await runCli(["scan", "--file", wanted, "--output", output, "--decoded-log", path.join(root, "decoded.jsonl")]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await fs.readFile(output, "utf8")).trim().split("\n"), [wantedSecret]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scan --file rejects a missing path", async () => {
  const result = await runCli(["scan", "--file", path.join(os.tmpdir(), "stellar-missing-file-does-not-exist.txt")]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Scan file does not exist/);
});

test("scan --root rejects a missing directory", async () => {
  const result = await runCli(["scan", "--root", path.join(os.tmpdir(), "stellar-missing-root-does-not-exist")]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Scan root does not exist/);
});

test("scan --password-file unlocks a passworded ZIP without container search-all", async () => {
  const path7za = await resolveSevenZipPath();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-pw-"));
  const member = path.join(root, "member.txt");
  const archive = path.join(root, "locked.zip");
  const passwordFile = path.join(root, "passwords.txt");
  const output = path.join(root, "secrets.txt");
  const secret = Keypair.random().secret();
  try {
    await fs.writeFile(member, secret);
    await execFileAsync(path7za, ["a", "-tzip", `-popen-sesame`, archive, member], { windowsHide: true });
    await fs.rm(member);
    await fs.writeFile(passwordFile, "archive_password: open-sesame\n");
    const result = await runCli([
      "scan",
      "--root", root,
      "--password-file", passwordFile,
      "--output", output,
      "--decoded-log", path.join(root, "decoded.jsonl")
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await fs.readFile(output, "utf8")).trim().split("\n"), [secret]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scan --password-env unlocks a passworded ZIP", async () => {
  const path7za = await resolveSevenZipPath();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-pwenv-"));
  const member = path.join(root, "member.txt");
  const archive = path.join(root, "locked.zip");
  const output = path.join(root, "secrets.txt");
  const secret = Keypair.random().secret();
  try {
    await fs.writeFile(member, secret);
    await execFileAsync(path7za, ["a", "-tzip", "-pfrom-env", archive, member], { windowsHide: true });
    await fs.rm(member);
    const result = await runCli([
      "scan",
      "--root", root,
      "--password-env", "STELLAR_FORENSICS_TEST_PASSWORD",
      "--output", output,
      "--decoded-log", path.join(root, "decoded.jsonl")
    ], { env: { ...process.env, STELLAR_FORENSICS_TEST_PASSWORD: "from-env" } });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await fs.readFile(output, "utf8")).trim().split("\n"), [secret]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("invalid --password-search scope is rejected", async () => {
  const result = await runCli(["scan", "--root", os.tmpdir(), "--password-search", "everything"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --password-search scope/);
});

test("verify records invalid secrets and missing files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-verify-"));
  try {
    const missing = await runCli(["verify", path.join(root, "missing.txt")]);
    assert.equal(missing.code, 1);
    const empty = path.join(root, "empty.txt");
    await fs.writeFile(empty, "# none\n");
    const emptyResult = await runCli(["verify", empty, "--output", path.join(root, "empty.json")]);
    assert.equal(emptyResult.code, 1);
    assert.match(emptyResult.stderr, /No secret keys were found/);
    const invalid = path.join(root, "invalid.txt");
    const output = path.join(root, "invalid.json");
    await fs.writeFile(invalid, "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n");
    const invalidResult = await runCli(["verify", invalid, "--output", output, "--network", "testnet"]);
    assert.equal(invalidResult.code, 0, invalidResult.stderr);
    const payload = JSON.parse(await fs.readFile(output, "utf8"));
    assert.equal(payload.network, "testnet");
    assert.equal(payload.records[0].verification_status, "invalid_secret");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("verify checks an unused valid key against Horizon testnet", { timeout: 60_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-horizon-"));
  const secretFile = path.join(root, "secrets.txt");
  const output = path.join(root, "results.json");
  const keypair = Keypair.random();
  try {
    await fs.writeFile(secretFile, `${keypair.secret()}\n`);
    const result = await runCli(["verify", secretFile, "--network", "testnet", "--output", output], { timeout: 45_000 });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(await fs.readFile(output, "utf8"));
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].derived_public_key, keypair.publicKey());
    assert.equal(payload.records[0].verification_status, "valid_key_account_not_found");
    assert.equal(payload.records[0].account_found, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("unsupported network is rejected", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-net-"));
  const secretFile = path.join(root, "secrets.txt");
  try {
    await fs.writeFile(secretFile, `${Keypair.random().secret()}\n`);
    const result = await runCli(["verify", secretFile, "--network", "private", "--output", path.join(root, "out.json")]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unsupported network/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("report formats verification JSON into a text report", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-report-"));
  const input = path.join(root, "results.json");
  const output = path.join(root, "report.txt");
  const secret = Keypair.random().secret();
  try {
    await fs.writeFile(input, `${JSON.stringify({
      generated_at: "2026-09-17T00:00:00.000Z",
      network: "testnet",
      records: [{
        record_id: "rec-1",
        verification_status: "valid_key_account_not_found",
        secret_key: secret,
        source_paths: [input],
        discovery_methods: ["input_file"],
        derived_public_key: "GTEST",
        horizon_account_id: null,
        public_key_match: false,
        account: null
      }]
    }, null, 2)}\n`);
    const result = await runCli(["report", input, "--output", output, "--verbose", "--log", path.join(root, "report.log")]);
    assert.equal(result.code, 0, result.stderr);
    const text = await fs.readFile(output, "utf8");
    assert.match(text, /Stellar Forensics Verification Report/);
    assert.match(text, /valid_key_account_not_found/);
    assert.match(text, /GTEST/);
    assert.match(await fs.readFile(path.join(root, "report.log"), "utf8"), /"event":"report_completed"/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("report rejects invalid JSON", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-bad-report-"));
  const input = path.join(root, "bad.json");
  try {
    await fs.writeFile(input, "{not-json");
    const result = await runCli(["report", input, "--output", path.join(root, "report.txt")]);
    assert.equal(result.code, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scan --file --verify records a discovered key against Horizon testnet", { timeout: 60_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-scan-verify-"));
  const carrier = path.join(root, "carrier.txt");
  const output = path.join(root, "secrets.txt");
  const results = path.join(root, "scan-results.json");
  const keypair = Keypair.random();
  try {
    await fs.writeFile(carrier, `${keypair.secret()}\n`);
    const result = await runCli([
      "scan",
      "--file", carrier,
      "--verify",
      "--network", "testnet",
      "--output", output,
      "--results", results,
      "--decoded-log", path.join(root, "decoded.jsonl")
    ], { timeout: 45_000 });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(await fs.readFile(results, "utf8"));
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].derived_public_key, keypair.publicKey());
    assert.equal(payload.records[0].verification_status, "valid_key_account_not_found");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scan --verify with zero candidates writes an empty verification file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-empty-scan-"));
  const output = path.join(root, "secrets.txt");
  const results = path.join(root, "scan-results.json");
  try {
    await fs.writeFile(path.join(root, "empty.txt"), "no secrets here\n");
    const result = await runCli([
      "scan",
      "--root", root,
      "--verify",
      "--network", "testnet",
      "--output", output,
      "--results", results,
      "--decoded-log", path.join(root, "decoded.jsonl")
    ]);
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(await fs.readFile(results, "utf8"));
    assert.deepEqual(payload.records, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
