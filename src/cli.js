#!/usr/bin/env node

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { extractFromBuffer, SUPPORTED_CARRIERS } from "./extractors.js";
import { environmentPasswordCandidates, findPasswordCandidates } from "./passwords.js";

const DEFAULT_HORIZON = "https://horizon.stellar.org";

function usage() {
  console.log(`Usage:
      stellar-forensics scan --all-drives [--verify] [--network public|testnet] [--password-search all-drives] [--password-env NAME] [--password-file FILE] [--output secrets.txt] [--verbose] [--log scan.log]
      stellar-forensics verify <secret-file> [--network public|testnet] [--output report.json] [--verbose] [--log verify.log]
      stellar-forensics report <results.json> [--output report.txt] [--verbose] [--log report.log]

  Scan discovers Stellar secret-key candidates in readable files. The secret file
  must contain one Stellar secret key (S...) per line.
  Supported carriers: ${SUPPORTED_CARRIERS.join(", ")}.
  All readable virtual-machine disk files are scanned as raw bytes, including
  VMDK, VDI, VHD, VHDX, QCOW2, IMG, ISO, and OVA files.
  Secrets are read locally and are never sent to Horizon.`);
  }

  function createDecodedSink(options) {
    const output = options["decoded-log"] ?? "decoded-data.jsonl";
    const entries = [];
    return {
      output,
      record(buffer, details) {
        entries.push(JSON.stringify({
          timestamp: new Date().toISOString(),
          source_path: details.source ?? details.source_path ?? null,
          extractor: details.extractor,
          byte_length: buffer.length,
          data_base64: buffer.toString("base64")
        }));
      },
      async flush() {
        await fs.writeFile(output, `${entries.join("\n")}${entries.length ? "\n" : ""}`, "utf8");
      }
    };
  }

export function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [name, inlineValue] = arg.slice(2).split("=", 2);
      if (inlineValue === undefined && (name === "all-drives" || name === "help" || name === "verbose")) {
        options[name] = true;
        continue;
      }
      const value = inlineValue ?? args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
      options[name] = value;
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function createLogger(options, command) {
  const enabled = options.verbose === true || options.verbose === "true";
  return {
    enabled,
    logPath: options.log ?? `${command}.log`,
    entries: [],
    write(event, details = {}) {
      if (this.enabled) this.entries.push({ timestamp: new Date().toISOString(), event, ...details });
    },
    async flush() {
      if (this.enabled) await fs.writeFile(this.logPath, `${this.entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    }
  };
}

async function passwordCandidates(options, logger) {
  const candidates = [...environmentPasswordCandidates()];
  if (options["password-env"]) {
    const value = process.env[options["password-env"]];
    if (value) candidates.push(value);
  }
  if (options["password-file"]) {
    candidates.push(...await findPasswordCandidates({ files: [path.resolve(options["password-file"])] }));
  }
  if (options["password-search"] === "all-drives") {
    candidates.push(...await findPasswordCandidates({ allDrives: true }));
  }
  const unique = [...new Set(candidates)];
  logger.write("password_candidates_found", {
    count: unique.length,
    sources: {
      environment: candidates.length > 0,
      password_file: Boolean(options["password-file"]),
      all_drives: options["password-search"] === "all-drives"
    }
  });
  if (unique.length > 0) return unique;
  const prompted = await promptForPassword();
  return prompted ? [prompted] : [];
}

async function promptForPassword() {
  if (!process.stdin.isTTY) return null;
  const readline = await import("node:readline/promises");
  const terminal = readline.createInterface({ input: process.stdin, output: process.stderr });
  const password = await terminal.question("Container password (input is not logged): ");
  terminal.close();
  return password || null;
}

function networkConfig(network) {
  if (network === "public") return { horizonUrl: DEFAULT_HORIZON, passphrase: "Public Global Stellar Network ; September 2015" };
  if (network === "testnet") return { horizonUrl: "https://horizon-testnet.stellar.org", passphrase: "Test SDF Network ; September 2015" };
  throw new Error(`Unsupported network "${network}". Use public or testnet.`);
}

function readSecrets(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function derive(secret) {
  const keypair = Keypair.fromSecret(secret);
  return { publicKey: keypair.publicKey(), secret };
}

export function horizonFailureStatus(error) {
  const status = error?.response?.status;
  if (status === 429) return "horizon_rate_limited";
  if (status >= 500) return "horizon_server_error";
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT") return "horizon_timeout";
  return "horizon_unavailable";
}

async function verifySecret(candidate, horizon, network, baseReserveXlm, logger) {
  const secret = candidate.secret_key;
  const record = {
    record_id: randomUUID(),
    secret_key: secret,
    source_paths: candidate.source_paths ?? [],
    discovery_methods: candidate.discovery_methods ?? ["input_file"],
    derived_public_key: null,
    horizon_account_id: null,
    public_key_match: false,
    account_found: false,
    account: null,
    verification_status: "invalid_secret"
  };

  try {
    const { publicKey } = derive(secret);
    record.derived_public_key = publicKey;
    logger.write("secret_derived", { record_id: record.record_id, secret_key: secret, derived_public_key: publicKey });
    try {
      const account = await horizon.loadAccount(publicKey);
      const transactions = await account.transactions().limit(10).order("desc").call();
      record.account_found = true;
      record.account = {
        id: account.id,
        sequence: account.sequence,
        subentry_count: account.subentry_count,
        inflation_destination: account.inflation_destination ?? null,
        home_domain: account.home_domain ?? null,
        balances: account.balances,
        signers: account.signers,
        flags: account.flags,
        paging_token: account.paging_token,
        last_modified_ledger: account.last_modified_ledger,
        last_modified_time: account.last_modified_time,
        num_sponsoring: account.num_sponsoring ?? 0,
        num_sponsored: account.num_sponsored ?? 0,
        base_reserve_xlm: baseReserveXlm,
        minimum_balance_xlm: baseReserveXlm === null ? null : (2 + account.subentry_count) * baseReserveXlm,
        available_xlm_estimate: baseReserveXlm === null ? null : (() => {
          const native = account.balances.find((balance) => balance.asset_type === "native");
          return native ? Number(native.balance) - (2 + account.subentry_count) * baseReserveXlm : null;
        })(),
        recent_transactions: transactions.records.map((transaction) => ({
          id: transaction.id,
          hash: transaction.hash,
          created_at: transaction.created_at,
          ledger: transaction.ledger,
          successful: transaction.successful,
          fee_charged: transaction.fee_charged,
          operation_count: transaction.operation_count,
          memo: transaction.memo,
          memo_type: transaction.memo_type
        }))
      };
      record.horizon_account_id = account.id;
      record.public_key_match = account.id === publicKey;
      record.verification_status = record.public_key_match ? "verified" : "public_key_mismatch";
      logger.write("horizon_account_verified", { record });
    } catch (error) {
      if (error?.response?.status === 404) {
        record.verification_status = "valid_key_account_not_found";
        logger.write("horizon_account_not_found", { record_id: record.record_id, public_key: publicKey });
      } else {
        record.verification_status = horizonFailureStatus(error);
        logger.write("horizon_request_failed", { record_id: record.record_id, public_key: publicKey, error: String(error) });
        record.error = error instanceof Error ? error.message : String(error);
      }
    }
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    logger.write("secret_verification_failed", { record });
  }
  return record;
}

function windowsRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) roots.push(`${String.fromCharCode(code)}:\\`);
  return roots;
}

export function groupCandidates(matches) {
  const grouped = new Map();
  for (const match of matches) {
    const existing = grouped.get(match.secret_key) ?? {
      secret_key: match.secret_key,
      source_paths: [],
      discovery_methods: []
    };
    if (!existing.source_paths.includes(match.source_path)) existing.source_paths.push(match.source_path);
    if (!existing.discovery_methods.includes(match.discovery_method)) existing.discovery_methods.push(match.discovery_method);
    grouped.set(match.secret_key, existing);
  }
  return [...grouped.values()];
}

export function isArchiveSignature(buffer) {
  const signature = buffer.subarray(0, 16).toString("hex");
  const zip = ["504b0304", "504b0506", "504b0708"].some((prefix) => signature.startsWith(prefix));
  const sevenZip = signature.startsWith("377abcaf271c");
  const rar = signature.startsWith("526172211a07");
  const gzip = signature.startsWith("1f8b");
  const tar = buffer.length >= 265 && buffer.toString("ascii", 257, 262) === "ustar";
  return zip || sevenZip || rar || gzip || tar;
}

async function scanDirectory(directory, matches, seen, logger, passwords, decodedSink) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    logger.write("directory_scan_failed", { directory, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.name === "$Recycle.Bin" || entry.name === "System Volume Information" || entry.name === "node_modules") continue;
    if (entry.isDirectory()) {
      await scanDirectory(filePath, matches, seen, logger, passwords, decodedSink);
      continue;
    }
    if (!entry.isFile() || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const candidates = [];
      const header = Buffer.alloc(512);
      const handle = await fs.open(filePath, "r");
      await handle.read(header, 0, header.length, 0);
      await handle.close();
      const archive = isArchiveSignature(header);
      if (archive) {
        candidates.push(...await extractFromBuffer(await fs.readFile(filePath), filePath, {
          passwords,
          onDecoded: (buffer, details) => decodedSink.record(buffer, { ...details, source: details.source ?? filePath }),
          onArchiveEvent: (details) => logger.write("archive_extraction", details)
        }));
      }
      const stream = archive ? null : createReadStream(filePath, { highWaterMark: 1024 * 1024 });
      let remainder = Buffer.alloc(0);
      if (stream) {
        for await (const chunk of stream) {
          const window = Buffer.concat([remainder, chunk]);
          candidates.push(...await extractFromBuffer(window, filePath, {
            passwords: [],
            allowArchives: false,
            onDecoded: (buffer, details) => decodedSink.record(buffer, { ...details, source: details.source ?? filePath })
          }));
          remainder = window.subarray(Math.max(0, window.length - 128));
        }
      }
      const uniqueCandidates = new Map(candidates.map((candidate) => [`${candidate.secret_key}\0${candidate.extractor}\0${candidate.offset ?? ""}`, candidate]));
      for (const candidate of uniqueCandidates.values()) {
        matches.push({ ...candidate, discovery_method: candidate.extractor });
        logger.write("candidate_discovered", { ...candidate, discovery_method: candidate.extractor });
      }
    } catch (error) {
      logger.write("file_scan_failed", {
        file_path: filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

async function scanCommand(options) {
  const logger = createLogger(options, "scan");
  const decodedSink = createDecodedSink(options);
  if (options["password-search"] !== undefined && options["password-search"] !== "all-drives") {
    throw new Error('Invalid --password-search scope. Use "--password-search all-drives".');
  }
  let passwords = [];
  try {
    passwords = await passwordCandidates(options, logger);
  } catch (error) {
    logger.write("password_discovery_failed", { error: error instanceof Error ? error.message : String(error) });
    process.stderr.write(`Warning: password discovery failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  logger.write("scan_started", { all_drives: options["all-drives"] === true });
  if (options["all-drives"] !== "true" && options["all-drives"] !== true) {
    throw new Error("Scanning requires --all-drives.");
  }
  const matches = [];
  const seen = new Set();
  for (const root of windowsRoots()) {
    process.stderr.write(`Scanning ${root}\n`);
    logger.write("drive_scan_started", { root });
    await scanDirectory(root, matches, seen, logger, passwords, decodedSink);
  }
  const unique = groupCandidates(matches);
  const output = options.output ?? "secrets.txt";
  try {
    await fs.writeFile(output, `${unique.map((match) => match.secret_key).join("\n")}\n`, "utf8");
    await fs.writeFile(`${output}.sources.json`, `${JSON.stringify(unique, null, 2)}\n`, "utf8");
  } catch (error) {
    logger.write("scan_output_failed", { output, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  if (options.verify === true || options.verify === "true") {
    await verifyCandidates(unique, options, logger, "scan");
  }
  logger.write("scan_completed", { output, candidate_count: unique.length, matches: unique });
  await decodedSink.flush();
  await logger.flush();
  console.log(`Found ${unique.length} candidate(s); wrote ${output}`);
  console.log(`Wrote decoded data log to ${decodedSink.output}`);
  if (logger.enabled) console.log(`Wrote verbose log to ${logger.logPath}`);
}

async function verifyCandidates(candidates, options, logger, command) {
  const network = options.network ?? "public";
  const config = networkConfig(network);
  const output = options.results ?? (command === "scan" ? "scan-results.json" : "results.json");
  if (candidates.length === 0) {
    const result = { generated_at: new Date().toISOString(), network, horizon_url: config.horizonUrl, records: [] };
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    logger.write("verification_skipped", { reason: "no_candidates", output });
    await logger.flush();
    console.log(`Wrote 0 verification record(s) to ${output}`);
    return;
  }
  const horizon = new Horizon.Server(config.horizonUrl);
  let baseReserveXlm = null;
  try {
    const root = await (await fetch(`${config.horizonUrl}/`)).json();
    if (root.base_reserve_in_stroops) baseReserveXlm = Number(root.base_reserve_in_stroops) / 10_000_000;
  } catch {
    logger.write("horizon_parameters_failed");
  }
  const records = [];
  for (const candidate of candidates) {
    process.stderr.write(`Verifying ${candidate.secret_key.slice(0, 4)}...${candidate.secret_key.slice(-4)}\n`);
    records.push(await verifySecret(candidate, horizon, network, baseReserveXlm, logger));
  }
  const result = { generated_at: new Date().toISOString(), network, horizon_url: config.horizonUrl, records };
  try {
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  } catch (error) {
    logger.write("verification_output_failed", { output, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  logger.write("verification_completed", { output, record_count: records.length, records });
  await logger.flush();
  console.log(`Wrote ${records.length} verification record(s) to ${output}`);
}

async function verifyCommand(secretFile, options) {
  const logger = createLogger(options, "verify");
  logger.write("verification_started", { secret_file: secretFile });
  const network = options.network ?? "public";
  const config = networkConfig(network);
  let text;
  try {
    text = await fs.readFile(secretFile, "utf8");
  } catch (error) {
    logger.write("secret_file_read_failed", { secret_file: secretFile, error: error instanceof Error ? error.message : String(error) });
    await logger.flush();
    throw error;
  }
  const secrets = readSecrets(text).map((secret) => ({ secret_key: secret, source_paths: [secretFile], discovery_methods: ["input_file"] }));
  if (secrets.length === 0) throw new Error("No secret keys were found in the input file.");
  logger.write("secrets_loaded", { count: secrets.length });
  const horizon = new Horizon.Server(config.horizonUrl);
  let baseReserveXlm = null;
  try {
    const root = await (await fetch(`${config.horizonUrl}/`)).json();
    if (root.base_reserve_in_stroops) baseReserveXlm = Number(root.base_reserve_in_stroops) / 10_000_000;
    logger.write("horizon_parameters_loaded", { base_reserve_xlm: baseReserveXlm });
  } catch {
    process.stderr.write("Warning: unable to read Horizon reserve parameters; reserve estimates will be unavailable.\n");
    logger.write("horizon_parameters_failed");
  }
  const records = [];
  for (const candidate of secrets) {
    process.stderr.write(`Verifying ${candidate.secret_key.slice(0, 4)}...${candidate.secret_key.slice(-4)}\n`);
    records.push(await verifySecret(candidate, horizon, network, baseReserveXlm, logger));
  }
  const result = {
    generated_at: new Date().toISOString(),
    network,
    horizon_url: config.horizonUrl,
    records
  };
  const output = options.output ?? "results.json";
  await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logger.write("verification_completed", { output, record_count: records.length, records });
  await logger.flush();
  console.log(`Wrote ${records.length} record(s) to ${output}`);
  if (logger.enabled) console.log(`Wrote verbose log to ${logger.logPath}`);
}

function accountSummary(account) {
  if (!account) return "Account not found on Horizon.";
  const balances = account.balances.map((balance) => {
    const asset = balance.asset_type === "native" ? "XLM" : `${balance.asset_code}:${balance.asset_issuer}`;
    return `  ${asset}: ${balance.balance} (buying liabilities: ${balance.buying_liabilities ?? "0"}, selling liabilities: ${balance.selling_liabilities ?? "0"}, limit: ${balance.limit ?? "n/a"})`;
  }).join("\n");
  return [
    `Account: ${account.id}`,
    `Sequence: ${account.sequence}`,
    `Subentries: ${account.subentry_count}`,
    `Sponsoring: ${account.num_sponsoring}, sponsored: ${account.num_sponsored}`,
    `Base reserve: ${account.base_reserve_xlm ?? "unavailable"} XLM`,
    `Minimum balance estimate: ${account.minimum_balance_xlm ?? "unavailable"} XLM`,
    `Available XLM estimate: ${account.available_xlm_estimate ?? "unavailable"} XLM`,
    `Recent transactions: ${account.recent_transactions?.length ?? 0}`,
    "Balances:",
    balances || "  none"
  ].join("\n");
}

async function reportCommand(input, options) {
  const logger = createLogger(options, "report");
  logger.write("report_started", { input });
  const result = JSON.parse(await fs.readFile(input, "utf8"));
  const lines = [`Stellar Forensics Verification Report`, `Generated: ${result.generated_at}`, `Network: ${result.network}`, ""];
  for (const record of result.records) {
    lines.push(`Record ${record.record_id}`);
    lines.push(`Status: ${record.verification_status}`);
    lines.push(`Secret key: ${record.secret_key}`);
    lines.push(`Source paths: ${(record.source_paths ?? []).join("; ") || "unknown"}`);
    lines.push(`Discovery methods: ${(record.discovery_methods ?? []).join(", ") || "unknown"}`);
    lines.push(`Derived public key: ${record.derived_public_key ?? "unavailable"}`);
    lines.push(`Horizon account ID: ${record.horizon_account_id ?? "not found"}`);
    lines.push(`Public key match: ${record.public_key_match ? "PASS" : "FAIL"}`);
    lines.push(accountSummary(record.account));
    if (record.error) lines.push(`Error: ${record.error}`);
    lines.push("", "-".repeat(72), "");
  }
  const output = options.output ?? "report.txt";
  await fs.writeFile(output, `${lines.join("\n")}\n`, "utf8");
  logger.write("report_completed", { output, record_count: result.records.length, records: result.records });
  await logger.flush();
  console.log(`Wrote report to ${output}`);
  if (logger.enabled) console.log(`Wrote verbose log to ${logger.logPath}`);
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || options.help || command === "-h") return usage();
  if (command === "scan") return scanCommand(options);
  if (command === "verify" && positional[1]) return verifyCommand(path.resolve(positional[1]), options);
  if (command === "report" && positional[1]) return reportCommand(path.resolve(positional[1]), options);
  usage();
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
