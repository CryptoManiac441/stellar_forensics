import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectJobDiagnostics, writeJobDiagnostics } from "../../scripts/ci/collect-job-diagnostics.mjs";
import { aggregateDiagnostics, renderDiagnosticsSummary } from "../../scripts/ci/aggregate-diagnostics.mjs";

test("cell diagnostics capture matrix identity and headless policy", () => {
  const diagnostics = collectJobDiagnostics(
    {
      CI: "true",
      MATRIX_OS: "ubuntu-latest",
      MATRIX_NODE: "22",
      HEADED: "0",
      GITHUB_RUN_ID: "123"
    },
    {
      testExitCode: 0,
      npmVersion: "10.9.7",
      headless: { ok: true }
    }
  );
  assert.equal(diagnostics.schema, "stellar-forensics.ci.cell-diagnostics.v1");
  assert.equal(diagnostics.matrix.os, "ubuntu-latest");
  assert.equal(diagnostics.matrix.node, "22");
  assert.equal(diagnostics.ci.test_exit_code, 0);
  assert.equal(diagnostics.headless.ok, true);
});

test("aggregator keeps every cell when one test exit is non-zero", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-diag-"));
  try {
    const ubuntuDir = path.join(root, "diagnostics-ubuntu-latest-node-22");
    const windowsDir = path.join(root, "diagnostics-windows-latest-node-22");
    await writeJobDiagnostics(path.join(ubuntuDir, "cell.json"), collectJobDiagnostics(
      { MATRIX_OS: "ubuntu-latest", MATRIX_NODE: "22" },
      { testExitCode: 1, headless: { ok: true } }
    ));
    await writeJobDiagnostics(path.join(windowsDir, "cell.json"), collectJobDiagnostics(
      { MATRIX_OS: "windows-latest", MATRIX_NODE: "22" },
      { testExitCode: 0, headless: { ok: true } }
    ));

    const markdownOut = path.join(root, "summary.md");
    const jsonOut = path.join(root, "summary.json");
    const result = await aggregateDiagnostics({ inputDir: root, markdownOut, jsonOut });
    assert.equal(result.cellCount, 2);
    assert.equal(result.failedCells, 1);
    assert.match(result.markdown, /ubuntu-latest/);
    assert.match(result.markdown, /windows-latest/);
    const parsed = JSON.parse(await fs.readFile(jsonOut, "utf8"));
    assert.equal(parsed.cell_count, 2);
    assert.equal(parsed.failed_cells, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("aggregator reports zero cells when the input directory is missing", async () => {
  const summary = renderDiagnosticsSummary([]);
  assert.equal(summary.cellCount, 0);
  assert.match(summary.markdown, /No cell.json diagnostics were found/);
});
