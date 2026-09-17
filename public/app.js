const $ = (id) => document.getElementById(id);
const form = $("run-form");
let running = false;

function setCommand(command) {
  $("command").value = command;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.command === command));
  const scan = command === "scan";
  $("all-drives-row").classList.toggle("hidden", !scan);
  $("root").parentElement.classList.toggle("hidden", !scan);
  $("scan-hint").classList.toggle("hidden", !scan);
  $("input-row").classList.toggle("hidden", scan);
  $("verify").parentElement.classList.toggle("hidden", !scan);
  $("password-search").parentElement.classList.toggle("hidden", !scan);
  $("output").previousElementSibling.textContent = command === "scan" ? "Secret output file" : command === "verify" ? "Result output file" : "Report output file";
  $("run-button span").textContent = command === "scan" ? "Run scan" : command === "verify" ? "Verify keys" : "Build report";
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setCommand(tab.dataset.command)));

function addLine(text, kind = "") {
  const feed = $("feed");
  if (feed.querySelector(".empty")) feed.innerHTML = "";
  const line = document.createElement("div");
  line.className = `line ${kind}`;
  line.textContent = text;
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
}

function payload() {
  return {
    command: $("command").value, root: $("root").value.trim(), input: $("input").value.trim(),
    allDrives: $("all-drives").checked, network: $("network").value, verify: $("verify").checked,
    verbose: $("verbose").checked, passwordSearch: $("password-search").checked,
    passwordEnv: $("password-env").value.trim(), passwordFile: $("password-file").value.trim(),
    output: $("output").value.trim(), decodedLog: $("decoded-log").value.trim(),
    log: $("log").value.trim(), results: $("results").value.trim()
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (running) return;
  const data = payload();
  if (data.command === "scan" && !data.root && !data.allDrives) return addLine("Choose a bounded root or enable all mounted drives.", "error");
  if (data.command !== "scan" && !data.input) return addLine("Choose an input file.", "error");
  running = true;
  $("run-button").disabled = true;
  $("status").className = "status running";
  $("status").textContent = "Running";
  $("feed").innerHTML = "";
  addLine(`Starting ${data.command} locally...`);
  try {
    const response = await fetch("/api/run", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data) });
    if (!response.ok) throw new Error((await response.json()).error || "Unable to start operation.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.filter(Boolean).forEach((line) => {
        const event = JSON.parse(line);
        if (event.type === "stdout") addLine(event.text);
        if (event.type === "stderr") addLine(event.text, "stderr");
        if (event.type === "error") addLine(event.message, "error");
        if (event.type === "complete") addLine(`Process finished with exit code ${event.code}${event.signal ? ` (${event.signal})` : ""}`, event.code === 0 ? "" : "error");
      });
    }
    $("status").className = "status " + (response.ok ? "idle" : "error");
    $("status").textContent = "Complete";
  } catch (error) {
    addLine(error.message, "error");
    $("status").className = "status error";
    $("status").textContent = "Failed";
  } finally {
    running = false;
    $("run-button").disabled = false;
  }
});
$("clear").addEventListener("click", () => { $("feed").innerHTML = '<div class="empty"><div class="empty-icon">✦</div><h3>Ready when you are</h3><p>Configure an operation to see process output, discoveries, and errors here.</p></div>'; });
document.addEventListener("keydown", (event) => { if (event.ctrlKey && event.key === "Enter") form.requestSubmit(); });
setCommand("scan");
