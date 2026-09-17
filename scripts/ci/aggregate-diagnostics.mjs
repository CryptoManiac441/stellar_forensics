#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export async function findCellDiagnostics(rootDirectory) {
  const found = [];
  try {
    await fs.access(rootDirectory);
  } catch {
    return found;
  }

  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Unable to read diagnostics directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === "cell.json") {
        const raw = await fs.readFile(entryPath, "utf8");
        found.push({
          path: entryPath,
          diagnostics: JSON.parse(raw)
        });
      }
    }
  }

  await walk(rootDirectory);
  return found.sort((left, right) => left.path.localeCompare(right.path));
}

export function renderDiagnosticsSummary(cells) {
  const lines = [
    "# Matrix diagnostics summary",
    "",
    `Cells found: ${cells.length}`,
    ""
  ];

  if (cells.length === 0) {
    lines.push("No cell.json diagnostics were found. The aggregator still ran so operators can see a missing-artifact condition instead of a cancelled matrix.");
    lines.push("");
    return { markdown: lines.join("\n"), failedCells: 0, cellCount: 0 };
  }

  lines.push("| Artifact path | OS | Node | Platform | Test exit | Headless ok |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  let failedCells = 0;
  for (const cell of cells) {
    const diagnostics = cell.diagnostics;
    const testExit = diagnostics?.ci?.test_exit_code;
    const failed = testExit !== 0 && testExit !== null && testExit !== undefined;
    if (failed) failedCells += 1;
    const osLabel = diagnostics?.matrix?.os ?? "unknown";
    const nodeLabel = diagnostics?.matrix?.node ?? diagnostics?.versions?.node ?? "unknown";
    const platform = diagnostics?.runner?.platform ?? "unknown";
    const headlessOk = diagnostics?.headless?.ok === true ? "yes" : diagnostics?.headless?.ok === false ? "no" : "n/a";
    lines.push(`| \`${cell.path}\` | ${osLabel} | ${nodeLabel} | ${platform} | ${testExit ?? "n/a"} | ${headlessOk} |`);
  }

  lines.push("");
  lines.push("Each matrix cell uploads its own artifact even when that cell fails. `fail-fast` is disabled so sibling cells keep running.");
  lines.push("");
  return { markdown: lines.join("\n"), failedCells, cellCount: cells.length };
}

export async function aggregateDiagnostics({ inputDir, markdownOut, jsonOut }) {
  const cells = await findCellDiagnostics(inputDir);
  const summary = renderDiagnosticsSummary(cells);
  const payload = {
    schema: "stellar-forensics.ci.matrix-diagnostics.v1",
    generated_at: new Date().toISOString(),
    cell_count: summary.cellCount,
    failed_cells: summary.failedCells,
    cells: cells.map((cell) => ({ path: cell.path, diagnostics: cell.diagnostics }))
  };
  await fs.mkdir(path.dirname(markdownOut), { recursive: true });
  await fs.writeFile(markdownOut, summary.markdown, "utf8");
  if (jsonOut) {
    await fs.mkdir(path.dirname(jsonOut), { recursive: true });
    await fs.writeFile(jsonOut, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  return { ...summary, payload };
}

function readArg(name, args) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function main() {
  const args = process.argv.slice(2);
  const inputDir = readArg("--input-dir", args);
  const markdownOut = readArg("--markdown-out", args);
  const jsonOut = readArg("--json-out", args);
  if (!inputDir || !markdownOut) {
    process.stderr.write("Usage: node scripts/ci/aggregate-diagnostics.mjs --input-dir <dir> --markdown-out <file> [--json-out <file>]\n");
    process.exitCode = 2;
    return;
  }
  const result = await aggregateDiagnostics({
    inputDir: path.resolve(inputDir),
    markdownOut: path.resolve(markdownOut),
    jsonOut: jsonOut ? path.resolve(jsonOut) : null
  });
  process.stdout.write(result.markdown);
  process.stdout.write(`\nWrote ${path.resolve(markdownOut)}\n`);
}

if (isMain()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
