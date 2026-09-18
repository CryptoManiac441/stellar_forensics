using System.Diagnostics;
using System.Drawing;
using System.Text;

namespace StellarForensics.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly ComboBox command = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox projectName = new();
    private readonly TextBox root = new();
    private readonly TextBox scanFile = new() { Width = 250, PlaceholderText = "C:\\path\\file.rtf" };
    private readonly Button browseScanFile = new() { Text = "Browse...", AutoSize = true };
    private readonly FlowLayoutPanel scanFilePicker = new() { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
    private readonly CheckBox allDrives = new() { Text = "Scan all mounted drives" };
    private readonly TextBox input = new();
    private readonly ComboBox network = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox output = new();
    private readonly CheckBox verify = new() { Text = "Verify candidates with Horizon" };
    private readonly CheckBox verbose = new() { Text = "Write verbose audit log", Checked = true };
    private readonly CheckBox passwordSearch = new() { Text = "Search container passwords" };
    private readonly TextBox passwordEnv = new();
    private readonly TextBox passwordFile = new();
    private readonly TextBox decodedLog = new();
    private readonly TextBox log = new();
    private readonly TextBox results = new();
    private readonly RichTextBox feed = new() { ReadOnly = true, BackColor = Color.FromArgb(9, 17, 31), ForeColor = Color.FromArgb(220, 232, 245), Dock = DockStyle.Fill };
    private readonly Button run = new() { Text = "Run operation", AutoSize = true };
    private readonly MenuStrip menu = new();
    private readonly ToolStripStatusLabel status = new("Ready");
    private readonly StatusStrip statusBar = new();
    private Process? activeProcess;
    private readonly string repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
    private readonly string desktopOutputFolder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
    private string defaultOutputPath = string.Empty;
    private string defaultLogPath = string.Empty;

    public MainForm()
    {
        Text = "Stellar Forensics";
        Width = 1100;
        Height = 760;
        MinimumSize = new Size(900, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9, 17, 31);
        ForeColor = Color.FromArgb(234, 241, 251);
        Font = new Font("Segoe UI", 9F);
        command.Items.AddRange(["Scan", "Verify", "Report"]);
        command.SelectedIndex = 0;
        projectName.Text = "Stellar Forensics";
        network.Items.AddRange(["public", "testnet"]);
        network.SelectedIndex = 0;
        defaultOutputPath = Path.Combine(GetProjectFolder(), "secrets.txt");
        defaultLogPath = Path.Combine(GetProjectFolder(), "scan.log");
        output.Text = defaultOutputPath;
        decodedLog.Text = Path.Combine(GetProjectFolder(), "decoded-data.jsonl");
        log.Text = defaultLogPath;
        results.Text = Path.Combine(GetProjectFolder(), "scan-results.json");
        projectName.TextChanged += (_, _) => UpdateProjectFolderPaths();
        run.Click += async (_, _) => await RunOperationAsync();
        command.SelectedIndexChanged += (_, _) => UpdateCommandView();
        allDrives.CheckedChanged += (_, _) => root.Enabled = !allDrives.Checked;
        browseScanFile.Click += (_, _) => BrowseScanFile();
        Controls.Add(BuildWindow());
        UpdateCommandView();
    }

    private Control BuildWindow()
    {
        var window = new Panel { Dock = DockStyle.Fill, BackColor = BackColor };
        window.Controls.Add(BuildLayout());
        window.Controls.Add(BuildStatusBar());
        window.Controls.Add(BuildMenu());
        return window;
    }

    private MenuStrip BuildMenu()
    {
        menu.Dock = DockStyle.Top;
        menu.BackColor = Color.FromArgb(13, 31, 55);
        menu.ForeColor = Color.FromArgb(226, 237, 248);
        menu.Renderer = new ToolStripProfessionalRenderer(new HorizonColorTable());
        menu.Items.AddRange([BuildFileMenu(), BuildViewMenu(), BuildEditMenu(), BuildHelpMenu()]);
        return menu;
    }

    private ToolStripMenuItem BuildFileMenu()
    {
        var file = new ToolStripMenuItem("&File");
        file.DropDownItems.Add(MenuItem("&New session", (_, _) => ResetForm(), Keys.Control | Keys.N));
        file.DropDownItems.Add(MenuItem("&Open input file...", (_, _) => OpenInputFile(), Keys.Control | Keys.O));
        file.DropDownItems.Add(MenuItem("&Save activity feed...", (_, _) => SaveActivityFeed(), Keys.Control | Keys.S));
        file.DropDownItems.Add("Open output folder", null, (_, _) => OpenOutputFolder());
        file.DropDownItems.Add(new ToolStripSeparator());
        file.DropDownItems.Add(MenuItem("E&xit", (_, _) => Close(), Keys.Alt | Keys.F4));
        return file;
    }

    private ToolStripMenuItem BuildViewMenu()
    {
        var view = new ToolStripMenuItem("&View");
        view.DropDownItems.Add(MenuItem("Clear activity feed", (_, _) => feed.Clear(), Keys.Control | Keys.L));
        view.DropDownItems.Add("Reset form", null, (_, _) => ResetForm());
        var statusItem = new ToolStripMenuItem("Status bar") { Checked = true, CheckOnClick = true };
        statusItem.CheckedChanged += (_, _) => statusBar.Visible = statusItem.Checked;
        view.DropDownItems.Add(statusItem);
        return view;
    }

    private ToolStripMenuItem BuildEditMenu()
    {
        var edit = new ToolStripMenuItem("&Edit");
        edit.DropDownItems.Add(MenuItem("&Undo", (_, _) => EditFocused("undo"), Keys.Control | Keys.Z));
        edit.DropDownItems.Add(MenuItem("&Redo", (_, _) => EditFocused("redo"), Keys.Control | Keys.Y));
        edit.DropDownItems.Add(new ToolStripSeparator());
        edit.DropDownItems.Add(MenuItem("Cu&t", (_, _) => EditFocused("cut"), Keys.Control | Keys.X));
        edit.DropDownItems.Add(MenuItem("&Copy", (_, _) => EditFocused("copy"), Keys.Control | Keys.C));
        edit.DropDownItems.Add(MenuItem("&Paste", (_, _) => EditFocused("paste"), Keys.Control | Keys.V));
        edit.DropDownItems.Add(MenuItem("Select &all", (_, _) => EditFocused("select"), Keys.Control | Keys.A));
        return edit;
    }

    private static ToolStripMenuItem MenuItem(string text, EventHandler action, Keys shortcut)
    {
        var item = new ToolStripMenuItem(text) { ShortcutKeys = shortcut };
        item.Click += action;
        return item;
    }

    private ToolStripMenuItem BuildHelpMenu()
    {
        var help = new ToolStripMenuItem("&Help");
        help.DropDownItems.Add("Privacy and safety", null, (_, _) => MessageBox.Show(this,
            "Secret keys are processed locally. Only derived public keys are sent to Horizon during verification. Output files remain on your computer.",
            "Privacy and safety", MessageBoxButtons.OK, MessageBoxIcon.Information));
        help.DropDownItems.Add("Keyboard shortcuts", null, (_, _) => MessageBox.Show(this,
            "Ctrl+N  New session\nCtrl+O  Open input file\nCtrl+S  Save activity feed\nCtrl+L  Clear activity feed\nCtrl+Z/Y  Undo/redo\nCtrl+X/C/V  Cut/copy/paste\nCtrl+A  Select all",
            "Keyboard shortcuts", MessageBoxButtons.OK, MessageBoxIcon.Information));
        help.DropDownItems.Add("About Stellar Forensics", null, (_, _) => MessageBox.Show(this,
            "Stellar Forensics\nLocal discovery and Horizon verification console\n\nBuilt for controlled, auditable investigations.",
            "About", MessageBoxButtons.OK, MessageBoxIcon.Information));
        return help;
    }

    private Control BuildStatusBar()
    {
        statusBar.Dock = DockStyle.Bottom;
        statusBar.BackColor = Color.FromArgb(13, 31, 55);
        statusBar.ForeColor = Color.FromArgb(157, 184, 211);
        statusBar.Items.Add(status);
        statusBar.Items.Add(new ToolStripStatusLabel("LOCAL ONLY") { Spring = true, TextAlign = ContentAlignment.MiddleRight, ForeColor = Color.FromArgb(85, 214, 190) });
        return statusBar;
    }

    private Control BuildLayout()
    {
        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 380, Padding = new Padding(18), BackColor = BackColor };
        split.Panel1.Controls.Add(BuildControls());
        var activity = new GroupBox { Text = "Live operation feed", Dock = DockStyle.Fill, ForeColor = Color.FromArgb(128, 190, 231), Padding = new Padding(12) };
        activity.Controls.Add(feed);
        split.Panel2.Controls.Add(activity);
        return split;
    }

    private Control BuildControls()
    {
        var panel = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 3, Padding = new Padding(4) };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 22));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        Add(layout, "Project name", projectName, "Stellar Forensics", "Name for this investigation. A dedicated folder with this name is created on the Desktop for default results and logs.");
        Add(layout, "Operation", command, null, "Choose Scan to discover keys, Verify to check a key file, or Report to format saved results.");
        Add(layout, "Bounded scan root", root, "C:\\Users\\me\\Documents", "Folder to scan. Use this for a controlled test instead of scanning every drive.");
        scanFilePicker.Controls.Add(scanFile);
        scanFilePicker.Controls.Add(browseScanFile);
        Add(layout, "Exact scan file", scanFilePicker, null, "Scan only this one file. This is the safest way to wet-test a specific carrier.");
        Add(layout, "", allDrives, null, "Scan every mounted Windows drive. This can take a long time and may encounter protected folders.");
        Add(layout, "Input file", input, "secrets.txt or results.json", "Used by Verify or Report: select a secret-key file or saved verification JSON. Not used during Scan.");
        Add(layout, "Network", network, null, "Select the Stellar Horizon network to query for account data.");
        Add(layout, "Output file", output, "C:\\temp\\output.txt", "Where the selected operation writes its main text or JSON output.");
        Add(layout, "", verify, null, "After scanning, derive public keys locally and query Horizon without sending secret keys.");
        Add(layout, "", verbose, null, "Write detailed discovery, archive, verification, and error events to the verbose log.");
        Add(layout, "", passwordSearch, null, "Search for password candidates only when a recognized archive needs them.");
        Add(layout, "Password env var", passwordEnv, "ARCHIVE_PASSWORD", "Optional environment variable name containing an archive password.");
        Add(layout, "Password file", passwordFile, null, "Optional file containing labeled password or passphrase entries for encrypted containers.");
        Add(layout, "Decoded JSONL", decodedLog, "decoded-data.jsonl", "Path for decoded binary and nested payload records with source provenance.");
        Add(layout, "Verbose log", log, "scan.log", "Path for the JSONL audit log containing scan progress and errors.");
        Add(layout, "Verification results", results, "scan-results.json", "Path for Horizon verification records, public-key matches, balances, and statuses.");
        var note = new Label { Text = "Private keys remain local. Horizon receives only derived public keys.", AutoSize = true, ForeColor = Color.FromArgb(85, 214, 190), Padding = new Padding(0, 14, 0, 14) };
        layout.Controls.Add(note, 0, layout.RowCount);
        layout.SetColumnSpan(note, 3);
        layout.Controls.Add(run, 0, layout.RowCount);
        layout.SetColumnSpan(run, 3);
        panel.Controls.Add(layout);
        return panel;
    }

    private static void Add(TableLayoutPanel layout, string label, Control control, string? placeholder = null, string? description = null)
    {
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var row = layout.RowCount++;
        if (label.Length > 0) layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 8, 5, 0) }, 0, row);
        else layout.Controls.Add(new Label(), 0, row);
        control.Margin = new Padding(3, 4, 3, 4);
        if (control is TextBox text && placeholder is not null) text.PlaceholderText = placeholder;
        layout.Controls.Add(control, 1, row);
        layout.Controls.Add(new Label
        {
            Text = description ?? string.Empty,
            AutoSize = true,
            MaximumSize = new Size(340, 0),
            ForeColor = Color.FromArgb(145, 164, 189),
            Padding = new Padding(2, 7, 3, 3)
        }, 2, row);
    }

    private void UpdateCommandView()
    {
        var scan = command.SelectedItem?.ToString() == "Scan";
        allDrives.Visible = scan;
        root.Visible = scan;
        scanFilePicker.Visible = scan;
        verify.Visible = scan;
        passwordSearch.Visible = scan;
        input.Visible = true;
        input.Enabled = !scan;
        results.Visible = scan;
        decodedLog.Visible = scan;
        UpdateCommandDefaults(command.SelectedItem?.ToString() ?? "Scan");
    }

    private async Task RunOperationAsync()
    {
        if (activeProcess is not null) return;
        var selected = command.SelectedItem?.ToString() ?? "Scan";
        var projectFolder = GetProjectFolder();
        Directory.CreateDirectory(projectFolder);
        ApplyDefaultOutputPaths(selected);
        var selectedTargets = (allDrives.Checked ? 1 : 0) + (!string.IsNullOrWhiteSpace(root.Text) ? 1 : 0) + (!string.IsNullOrWhiteSpace(scanFile.Text) ? 1 : 0);
        if (selected == "Scan" && selectedTargets != 1)
        {
            MessageBox.Show(this, "Choose exactly one scan target: all drives, a bounded folder, or an exact file.", "Input required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (selected != "Scan" && string.IsNullOrWhiteSpace(input.Text))
        {
            MessageBox.Show(this, "Choose an input file.", "Input required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var psi = new ProcessStartInfo("node") { WorkingDirectory = repositoryRoot, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        psi.ArgumentList.Add(Path.Combine(repositoryRoot, "src", "terminal-proxy.js"));
        psi.ArgumentList.Add(selected.ToLowerInvariant());
        if (selected == "Scan")
        {
            if (allDrives.Checked) psi.ArgumentList.Add("--all-drives");
            else if (!string.IsNullOrWhiteSpace(scanFile.Text)) { psi.ArgumentList.Add("--file"); psi.ArgumentList.Add(Path.GetFullPath(scanFile.Text)); }
            else { psi.ArgumentList.Add("--root"); psi.ArgumentList.Add(Path.GetFullPath(root.Text)); }
            if (verify.Checked) psi.ArgumentList.Add("--verify");
            if (passwordSearch.Checked) { psi.ArgumentList.Add("--password-search"); psi.ArgumentList.Add("containers"); }
        }
        else psi.ArgumentList.Add(Path.GetFullPath(input.Text));
        psi.ArgumentList.Add("--network"); psi.ArgumentList.Add(network.Text);
        AddArgument(psi, "--output", output.Text);
        AddArgument(psi, "--password-env", passwordEnv.Text);
        AddArgument(psi, "--password-file", passwordFile.Text);
        AddArgument(psi, "--decoded-log", decodedLog.Text, selected == "Scan");
        AddArgument(psi, "--log", log.Text);
        AddArgument(psi, "--results", results.Text, selected == "Scan");
        if (verbose.Checked) psi.ArgumentList.Add("--verbose");

        feed.Clear();
        run.Enabled = false;
        status.Text = "Running operation...";
        activeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
        activeProcess.OutputDataReceived += (_, e) => { if (e.Data is not null) BeginInvoke(() => Append(e.Data + "\n")); };
        activeProcess.ErrorDataReceived += (_, e) => { if (e.Data is not null) BeginInvoke(() => Append(e.Data + "\n")); };
        activeProcess.Start();
        activeProcess.BeginOutputReadLine();
        activeProcess.BeginErrorReadLine();
        await activeProcess.WaitForExitAsync();
        var code = activeProcess.ExitCode;
        status.Text = code == 0 ? "Completed successfully" : $"Failed (exit code {code})";
        activeProcess.Dispose();
        activeProcess = null;
        run.Enabled = true;
        if (code == 0) ShowCompletionDialog(selected);
    }

    private void ApplyDefaultOutputPaths(string selected)
    {
        UpdateCommandDefaults(selected);
        SetDefault(decodedLog, "decoded-data.jsonl");
        SetDefault(log, selected == "Scan" ? "scan.log" : selected == "Verify" ? "verify.log" : "report.log");
        SetDefault(results, "scan-results.json");
        output.Text = ToDesktopPath(output.Text);
        decodedLog.Text = ToDesktopPath(decodedLog.Text);
        log.Text = ToDesktopPath(log.Text);
        results.Text = ToDesktopPath(results.Text);
    }

    private void UpdateCommandDefaults(string selected)
    {
        var nextOutput = Path.Combine(GetProjectFolder(), selected == "Scan" ? "secrets.txt" : selected == "Verify" ? "results.json" : "report.txt");
        var nextLog = Path.Combine(GetProjectFolder(), selected == "Scan" ? "scan.log" : selected == "Verify" ? "verify.log" : "report.log");
        if (string.IsNullOrWhiteSpace(output.Text) || output.Text == defaultOutputPath) output.Text = nextOutput;
        if (string.IsNullOrWhiteSpace(log.Text) || log.Text == defaultLogPath) log.Text = nextLog;
        defaultOutputPath = nextOutput;
        defaultLogPath = nextLog;
    }

    private void UpdateProjectFolderPaths()
    {
        var oldProjectFolder = Path.GetDirectoryName(defaultOutputPath) ?? desktopOutputFolder;
        var projectFolder = GetProjectFolder();
        var defaults = new[]
        {
            (output, Path.GetFileName(defaultOutputPath)),
            (decodedLog, "decoded-data.jsonl"),
            (log, Path.GetFileName(defaultLogPath)),
            (results, "scan-results.json")
        };
        foreach (var (field, fileName) in defaults)
        {
            if (string.IsNullOrWhiteSpace(field.Text) || field.Text.StartsWith(oldProjectFolder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                field.Text = Path.Combine(projectFolder, fileName);
        }
        defaultOutputPath = Path.Combine(projectFolder, Path.GetFileName(defaultOutputPath));
        defaultLogPath = Path.Combine(projectFolder, Path.GetFileName(defaultLogPath));
    }

    private void SetDefault(TextBox field, string fileName)
    {
        if (string.IsNullOrWhiteSpace(field.Text)) field.Text = Path.Combine(GetProjectFolder(), fileName);
    }

    private string ToDesktopPath(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? GetProjectFolder() : Path.IsPathRooted(value) ? value : Path.Combine(GetProjectFolder(), value);
    }

    private string GetProjectFolder()
    {
        var name = string.IsNullOrWhiteSpace(projectName.Text) ? "Stellar Forensics" : projectName.Text.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars()) name = name.Replace(invalid, '_');
        return Path.Combine(desktopOutputFolder, name);
    }

    private void ShowCompletionDialog(string operation)
    {
        var folder = Path.GetDirectoryName(output.Text);
        if (string.IsNullOrWhiteSpace(folder)) folder = desktopOutputFolder;
        using var dialog = new Form
        {
            Text = "Stellar Forensics complete",
            Width = 500,
            Height = 210,
            StartPosition = FormStartPosition.CenterParent,
            BackColor = BackColor,
            ForeColor = ForeColor,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MinimizeBox = false,
            MaximizeBox = false
        };
        var message = new Label
        {
            Text = $"{operation} finished successfully.\n\nResults and logs were saved to:\n{folder}",
            AutoSize = true,
            MaximumSize = new Size(460, 100),
            Location = new Point(18, 16)
        };
        var open = new Button { Text = "Open results folder", AutoSize = true, Location = new Point(18, 135) };
        open.Click += (_, _) =>
        {
            Process.Start(new ProcessStartInfo("explorer.exe", folder) { UseShellExecute = true });
            dialog.Close();
        };
        var close = new Button { Text = "Close", AutoSize = true, Location = new Point(165, 135) };
        close.Click += (_, _) => dialog.Close();
        dialog.Controls.AddRange([message, open, close]);
        dialog.ShowDialog(this);
    }

    private void OpenOutputFolder()
    {
        var target = output.Text;
        var folder = string.IsNullOrWhiteSpace(target) ? repositoryRoot : Path.GetDirectoryName(Path.GetFullPath(target)) ?? repositoryRoot;
        Process.Start(new ProcessStartInfo("explorer.exe", folder) { UseShellExecute = true });
    }

    private void OpenInputFile()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Select a secret-key or verification results file",
            Filter = "Supported files|*.txt;*.json;*.jsonl|All files|*.*"
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            input.Text = dialog.FileName;
            command.SelectedItem = dialog.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ? "Report" : "Verify";
        }
    }

    private void BrowseScanFile()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Select an exact scan file",
            Filter = "All files|*.*",
            CheckFileExists = true,
            Multiselect = false
        };
        if (dialog.ShowDialog(this) == DialogResult.OK) scanFile.Text = dialog.FileName;
    }

    private void SaveActivityFeed()
    {
        using var dialog = new SaveFileDialog
        {
            Title = "Save activity feed",
            Filter = "Text files|*.txt|All files|*.*",
            FileName = "stellar-forensics-activity.txt"
        };
        if (dialog.ShowDialog(this) == DialogResult.OK) File.WriteAllText(dialog.FileName, feed.Text);
    }

    private void EditFocused(string action)
    {
        if (ActiveControl is TextBoxBase textBox)
        {
            switch (action)
            {
                case "undo": if (textBox.CanUndo) textBox.Undo(); break;
                case "redo" when textBox is RichTextBox richTextBox: richTextBox.Redo(); break;
                case "cut": textBox.Cut(); break;
                case "copy": textBox.Copy(); break;
                case "paste": textBox.Paste(); break;
                case "select": textBox.SelectAll(); break;
            }
            return;
        }
        if (action == "copy") feed.Copy();
        if (action == "select") feed.SelectAll();
    }

    private void ResetForm()
    {
        root.Clear();
        scanFile.Clear();
        input.Clear();
        output.Clear();
        passwordEnv.Clear();
        passwordFile.Clear();
        decodedLog.Clear();
        log.Clear();
        results.Clear();
        allDrives.Checked = false;
        verify.Checked = false;
        passwordSearch.Checked = false;
        verbose.Checked = true;
        network.SelectedIndex = 0;
        command.SelectedIndex = 0;
        feed.Clear();
        status.Text = "Ready";
    }

    private static void AddArgument(ProcessStartInfo psi, string name, string value, bool enabled = true)
    {
        if (!enabled || string.IsNullOrWhiteSpace(value)) return;
        psi.ArgumentList.Add(name);
        psi.ArgumentList.Add(Path.GetFullPath(value));
    }

    internal sealed class HorizonColorTable : ProfessionalColorTable
    {
        public override Color MenuBorder => Color.FromArgb(40, 79, 112);
        public override Color MenuItemBorder => Color.FromArgb(67, 137, 172);
        public override Color MenuItemSelected => Color.FromArgb(24, 70, 103);
        public override Color ToolStripDropDownBackground => Color.FromArgb(13, 31, 55);
        public override Color ImageMarginGradientBegin => Color.FromArgb(13, 31, 55);
        public override Color ImageMarginGradientMiddle => Color.FromArgb(13, 31, 55);
        public override Color ImageMarginGradientEnd => Color.FromArgb(13, 31, 55);
    }

    private void Append(string text)
    {
        feed.AppendText(text);
        feed.SelectionStart = feed.TextLength;
        feed.ScrollToCaret();
    }
}
