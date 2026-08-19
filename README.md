# SF Log Viewer

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=pettll.sf-log-viewer)

Seamlessly view, filter, sort, and download Salesforce Apex logs across your locally authenticated orgs directly inside Visual Studio Code.

Powered by your existing Salesforce CLI (`sf`) authentication—no need to manage, copy, or paste Salesforce access tokens into VS Code.

---

## Key Features

- **Zero-Token Auth:** Leverages your local Salesforce CLI authentication out of the box.
- **Org Switching:** Easily switch between authenticated dev hubs, scratch orgs, and sandboxes from the side panel.
- **Advanced Filtering & Sorting:** Filter logs by date range, user, or general text. Sort by start time, duration, status, operation, size, or user.
- **Trace Flag Management:** Search Salesforce users and create or extend `USER_DEBUG` trace flags directly from VS Code.
- **Log Downloads:** Export individual logs or batch-download all current logs with a auto-generated metadata index (`apex-log-index.json`).
- **Native Log Viewer:** Opens full Apex log bodies in native VS Code editor tabs for quick reading and debugging.

---

## Requirements

Before using this extension, make sure you have:

* **Salesforce CLI (`sf`)** installed and available in your system path.
* At least **one authenticated Salesforce org** via the CLI:
```bash
  sf org login web --alias my-org
```

---

## Quick Start

1. **Select an Org:** Open the **SF Logs** activity bar panel and choose your target org from the **Authenticated Orgs** view.
2. **Set a Trace Flag (Optional):** Go to the **Trace User** view to set up a `USER_DEBUG` trace flag for your user.
3. **Fetch & View Logs:** Open the **Apex Logs** view, click **Refresh Logs**, and select any log to view its raw body.
4. **Filter & Sort:** Adjust date ranges, user filters, and sorting preferences directly from the **Filters and Sort** panel.

---

## Extension Views

This extension adds an **SF Logs** icon to the Activity Bar with four primary views:

| View | Description |
| --- | --- |
| **Authenticated Orgs** | Lists all Salesforce CLI orgs currently authenticated on your machine. |
| **Trace User** | Interface to search users, select debug levels, and extend/create trace flags. |
| **Filters and Sort** | Controls for log limits, date ranges, text filters, and field sorting. |
| **Apex Logs** | Interactive list of fetched Apex logs ready for opening or downloading. |

---

## Workflows

### Setting Up a Trace Flag

1. Select an active org in **Authenticated Orgs**.
2. Under **Trace User**, click **Load Debug Levels**.
3. Search for a Salesforce user by name or username and select them.
4. Choose a **Debug Level** and set the start/end duration.
5. Click **Create or Extend Trace** to activate log generation for that user.

### Batch Downloading Logs

When downloading all loaded logs via `SF Logs: Download All Logs`, the extension structures the destination folder as:

```text
<chosen-folder>/
├── apex-log-index.json
├── 2026-08-19T10-15-00 - JSmith - ExecAnon - 07L...log
└── ...
```

The `apex-log-index.json` file includes full metadata for all exported logs for easy reference.

---

## Commands

Access these commands at any time via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command Title | Command Identifier | Description |
| --- | --- | --- |
| **SF Logs: Select Org** | `sfLogViewer.selectOrg` | Set the active Salesforce org for log operations. |
| **SF Logs: Refresh Orgs** | `sfLogViewer.refreshOrgs` | Reload local Salesforce CLI org authentications. |
| **SF Logs: Refresh Logs** | `sfLogViewer.refreshLogs` | Fetch recent Apex logs via the Salesforce Tooling API. |
| **SF Logs: Open Log** | `sfLogViewer.openLog` | Open the body of the selected log in an editor tab. |
| **SF Logs: Download Log** | `sfLogViewer.downloadLog` | Save a single Apex log to your local file system. |
| **SF Logs: Download All Logs** | `sfLogViewer.downloadAllLogs` | Export all currently loaded Apex logs and index metadata. |
| **SF Logs: Show Filters** | `sfLogViewer.showFilters` | Open the log filtering and sorting configuration panel. |
| **SF Logs: Clear Filters** | `sfLogViewer.clearFilters` | Reset all active log filters and search fields. |
| **SF Logs: Create/Extend Trace** | `sfLogViewer.createTraceFlag` | Create or update a `USER_DEBUG` trace flag. |
| **SF Logs: Open Selected Org** | `sfLogViewer.openSelectedOrg` | Open the active org in your web browser via `sf org open`. |

---

## Troubleshooting

### Salesforce CLI Not Found

If the extension cannot locate your `sf` binary (e.g., when using `nvm` or custom terminal PATHs), configure the CLI path explicitly in your VS Code User Settings (`Cmd+,` or `Ctrl+,`):

* `sfLogViewer.sfPath`: Set the absolute path to your `sf` executable (e.g., `/usr/local/bin/sf`).

---

## Contributing & Issues

Found a bug, missing feature, or have feedback?

* **Source Code:** [GitHub Repository](https://github.com/pettll/sf-log-viewer)
* **Issue Tracker:** [Report an Issue](https://github.com/pettll/sf-log-viewer/issues)

---

## License

[MIT](LICENSE)
