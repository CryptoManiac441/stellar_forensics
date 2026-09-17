#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const port = Number(process.env.PORT ?? 4173);
const cli = path.join(root, "src", "cli.js");

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function safePath(value) {
  if (!value || typeof value !== "string") return null;
  const resolved = path.resolve(value);
  return resolved;
}

function buildArgs(body) {
  const command = body.command;
  if (!["scan", "verify", "report"].includes(command)) throw new Error("Unsupported command.");
  const args = [cli, command];
  if (command === "scan") {
    if (body.root) args.push("--root", safePath(body.root));
    else if (body.allDrives) args.push("--all-drives");
    else throw new Error("Choose a scan root or all drives.");
  } else {
    const input = safePath(body.input);
    if (!input) throw new Error(`A ${command} input file is required.`);
    args.push(input);
  }
  if (body.network) args.push("--network", body.network);
  if (body.verify && command === "scan") args.push("--verify");
  if (body.passwordSearch) args.push("--password-search", "containers");
  if (body.passwordEnv) args.push("--password-env", body.passwordEnv);
  if (body.passwordFile) args.push("--password-file", safePath(body.passwordFile));
  if (body.output) args.push("--output", safePath(body.output));
  if (body.results && command === "scan") args.push("--results", safePath(body.results));
  if (body.decodedLog && command === "scan") args.push("--decoded-log", safePath(body.decodedLog));
  if (body.log) args.push("--log", safePath(body.log));
  if (body.verbose) args.push("--verbose");
  return args;
}

async function runCommand(request, response, body) {
  const args = buildArgs(body);
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true });
  const send = (event) => response.write(`${JSON.stringify(event)}\n`);
  send({ type: "started", command: args.slice(1) });
  child.stdout.on("data", (data) => send({ type: "stdout", text: data.toString() }));
  child.stderr.on("data", (data) => send({ type: "stderr", text: data.toString() }));
  child.on("error", (error) => send({ type: "error", message: error.message }));
  child.on("close", (code, signal) => {
    send({ type: "complete", code, signal });
    response.end();
  });
  request.on("aborted", () => child.kill());
}

async function serveFile(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(`${publicRoot}${path.sep}`)) return json(response, 403, { error: "Forbidden" });
  try {
    const content = await fs.readFile(file);
    const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "text/javascript";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    response.end(content);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "POST" && url.pathname === "/api/run") {
      let body = "";
      for await (const chunk of request) body += chunk;
      await runCommand(request, response, JSON.parse(body));
      return;
    }
    if (request.method === "GET") return serveFile(response, url.pathname);
    json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    if (!response.headersSent) json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    else response.end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Stellar Forensics UI: http://127.0.0.1:${port}`);
});
