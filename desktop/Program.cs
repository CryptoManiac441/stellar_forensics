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
    private readonly TextBox root = new();
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
    private Process? activeProcess;
    private readonly string repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));

    public MainForm()
    {
        Text = "Stellar Forensics";
        Width = 1100;
        Height = 760;
        MinimumSize = new Size(900, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9, 17, 31);
        ForeColor = Color.FromArgb(234, 241, 251);
        command.Items.AddRange(["Scan", "Verify", "Report"]);
        command.SelectedIndex = 0;
        network.Items.AddRange(["public", "testnet"]);
        network.SelectedIndex = 0;
        run.Click += async (_, _) => await RunOperationAsync();
        command.SelectedIndexChanged += (_, _) => UpdateCommandView();
        allDrives.CheckedChanged += (_, _) => root.Enabled = !allDrives.Checked;
        Controls.Add(BuildLayout());
        UpdateCommandView();
    }

    private Control BuildLayout()
    {
        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 455, Padding = new Padding(18), BackColor = BackColor };
        split.Panel1.Controls.Add(BuildControls());
        var activity = new GroupBox { Text = "Live operation feed", Dock = DockStyle.Fill, ForeColor = ForeColor, Padding = new Padding(12) };
        activity.Controls.Add(feed);
        split.Panel2.Controls.Add(activity);
        return split;
    }

    private Control BuildControls()
    {
        var panel = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, Padding = new Padding(4) };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 66));
        Add(layout, "Operation", command);
        Add(layout, "Bounded scan root", root, "C:\\Users\\me\\Documents");
        Add(layout, "", allDrives);
        Add(layout, "Input file", input, "secrets.txt or results.json");
        Add(layout, "Network", network);
        Add(layout, "Output file", output, "C:\\temp\\output.txt");
        Add(layout, "", verify);
        Add(layout, "", verbose);
        Add(layout, "", passwordSearch);
        Add(layout, "Password env var", passwordEnv, "ARCHIVE_PASSWORD");
        Add(layout, "Password file", passwordFile);
        Add(layout, "Decoded JSONL", decodedLog, "decoded-data.jsonl");
        Add(layout, "Verbose log", log, "scan.log");
        Add(layout, "Verification results", results, "scan-results.json");
        var note = new Label { Text = "Private keys remain local. Horizon receives only derived public keys.", AutoSize = true, ForeColor = Color.FromArgb(85, 214, 190), Padding = new Padding(0, 14, 0, 14) };
        layout.Controls.Add(note, 0, layout.RowCount);
        layout.SetColumnSpan(note, 2);
        layout.Controls.Add(run, 0, layout.RowCount);
        layout.SetColumnSpan(run, 2);
        panel.Controls.Add(layout);
        return panel;
    }

    private static void Add(TableLayoutPanel layout, string label, Control control, string? placeholder = null)
    {
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var row = layout.RowCount++;
        if (label.Length > 0) layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 8, 5, 0) }, 0, row);
        else layout.Controls.Add(new Label(), 0, row);
        control.Margin = new Padding(3, 4, 3, 4);
        if (control is TextBox text && placeholder is not null) text.PlaceholderText = placeholder;
        layout.Controls.Add(control, 1, row);
    }

    private void UpdateCommandView()
    {
        var scan = command.SelectedItem?.ToString() == "Scan";
        allDrives.Visible = scan;
        root.Visible = scan;
        verify.Visible = scan;
        passwordSearch.Visible = scan;
        input.Visible = !scan;
        results.Visible = scan;
        decodedLog.Visible = scan;
    }

    private async Task RunOperationAsync()
    {
        if (activeProcess is not null) return;
        var selected = command.SelectedItem?.ToString() ?? "Scan";
        if (selected == "Scan" && !allDrives.Checked && string.IsNullOrWhiteSpace(root.Text))
        {
            MessageBox.Show(this, "Choose a bounded scan root or enable all mounted drives.", "Input required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (selected != "Scan" && string.IsNullOrWhiteSpace(input.Text))
        {
            MessageBox.Show(this, "Choose an input file.", "Input required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var psi = new ProcessStartInfo("node") { WorkingDirectory = repositoryRoot, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        psi.ArgumentList.Add(Path.Combine(repositoryRoot, "src", "cli.js"));
        psi.ArgumentList.Add(selected.ToLowerInvariant());
        if (selected == "Scan")
        {
            if (allDrives.Checked) psi.ArgumentList.Add("--all-drives");
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
        Append("Starting local CLI process...\n");
        activeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
        activeProcess.OutputDataReceived += (_, e) => { if (e.Data is not null) BeginInvoke(() => Append(e.Data + "\n")); };
        activeProcess.ErrorDataReceived += (_, e) => { if (e.Data is not null) BeginInvoke(() => Append("[stderr] " + e.Data + "\n")); };
        activeProcess.Start();
        activeProcess.BeginOutputReadLine();
        activeProcess.BeginErrorReadLine();
        await activeProcess.WaitForExitAsync();
        var code = activeProcess.ExitCode;
        Append($"Process finished with exit code {code}.\n");
        activeProcess.Dispose();
        activeProcess = null;
        run.Enabled = true;
    }

    private static void AddArgument(ProcessStartInfo psi, string name, string value, bool enabled = true)
    {
        if (!enabled || string.IsNullOrWhiteSpace(value)) return;
        psi.ArgumentList.Add(name);
        psi.ArgumentList.Add(Path.GetFullPath(value));
    }

    private void Append(string text)
    {
        feed.AppendText(text);
        feed.SelectionStart = feed.TextLength;
        feed.ScrollToCaret();
    }
}
