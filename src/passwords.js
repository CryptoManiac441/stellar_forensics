import fs from "node:fs/promises";
import path from "node:path";

const PASSWORD_LINE = /^\s*(?:password|passwd|passphrase|archive[_ -]?password)\s*[:=]\s*(\S.*)$/i;

export function parsePasswordCandidates(text) {
  const candidates = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(PASSWORD_LINE);
    if (match?.[1]) candidates.push(match[1].trim().replace(/^["']|["']$/g, ""));
  }
  return [...new Set(candidates)].filter(Boolean);
}

function windowsRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) roots.push(`${String.fromCharCode(code)}:\\`);
  return roots;
}

export async function findPasswordCandidates({ allDrives = false, files = [] } = {}) {
  const candidates = new Set();
  const visited = new Set();
  const paths = allDrives ? windowsRoots() : files;

  async function visit(target) {
    let stat;
    try {
      stat = await fs.stat(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let entries;
      try {
        entries = await fs.readdir(target, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name === "$Recycle.Bin" || entry.name === "System Volume Information" || entry.name === "node_modules") continue;
        await visit(path.join(target, entry.name));
      }
      return;
    }
    if (!stat.isFile() || visited.has(target) || stat.size > 10 * 1024 * 1024) return;
    visited.add(target);
    try {
      const text = await fs.readFile(target, "utf8");
      for (const candidate of parsePasswordCandidates(text)) candidates.add(candidate);
    } catch {
      // Ignore unreadable and binary files; the caller can still prompt.
    }
  }

  for (const target of paths) await visit(target);
  return [...candidates];
}

export function environmentPasswordCandidates(env = process.env) {
  return Object.entries(env)
    .filter(([name, value]) => value && /(?:PASSWORD|PASSWD|PASSPHRASE|SECRET)/i.test(name))
    .map(([, value]) => value)
    .filter((value) => value.length > 0);
}
