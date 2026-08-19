import * as vscode from "vscode";
import { ApexLogFilter, ApexLogSortBy, ApexLogSortDirection } from "./types";

export class LogFilterViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "sfLogs.filters";

  private view?: vscode.WebviewView;

  constructor(
    private filter: ApexLogFilter,
    private readonly onApply: (filter: ApexLogFilter) => Promise<void>,
    private readonly onClear: () => Promise<void>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "apply") {
        this.filter = normaliseFilter(message.filter);
        await this.onApply(this.filter);
        this.refresh();
      }

      if (message.command === "clear") {
        this.filter = defaultFilter();
        await this.onClear();
        this.refresh();
      }

      if (message.command === "today") {
        const today = localDateString(new Date());

        this.filter = {
          ...this.filter,
          fromDate: today,
          toDate: today,
        };

        await this.onApply(this.filter);
        this.refresh();
      }

      if (message.command === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const value = localDateString(yesterday);

        this.filter = {
          ...this.filter,
          fromDate: value,
          toDate: value,
        };

        await this.onApply(this.filter);
        this.refresh();
      }
    });
  }

  setFilter(filter: ApexLogFilter): void {
    this.filter = filter;
    this.refresh();
  }

  refresh(): void {
    if (this.view) {
      this.view.webview.html = this.getHtml();
    }
  }

  private getHtml(): string {
    const filter = {
      fromDate: this.filter.fromDate ?? "",
      toDate: this.filter.toDate ?? "",
      userText: this.filter.userText ?? "",
      generalText: this.filter.generalText ?? "",
      limit: this.filter.limit ?? 100,
      sortBy: this.filter.sortBy ?? "StartTime",
      sortDirection: this.filter.sortDirection ?? "DESC",
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
    }

    input,
    select {
      width: 100%;
      box-sizing: border-box;
      margin-top: 3px;
      padding: 5px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }

    button {
      width: 100%;
      margin-top: 7px;
      padding: 7px;
      border: none;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 6px;
    }

    .hint {
      margin-top: 8px;
      opacity: 0.75;
      font-size: 11px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="row">
    <button onclick="sendPreset('today')" class="secondary">Today</button>
    <button onclick="sendPreset('yesterday')" class="secondary">Yesterday</button>
  </div>

  <label>
    From date
    <input id="fromDate" type="date" value="${escapeHtml(filter.fromDate)}" />
  </label>

  <label>
    To date
    <input id="toDate" type="date" value="${escapeHtml(filter.toDate)}" />
  </label>

  <label>
    User
    <input id="userText" type="text" value="${escapeHtml(filter.userText)}" placeholder="Name, username or user ID" />
  </label>

  <label>
    General search
    <input id="generalText" type="text" value="${escapeHtml(filter.generalText)}" placeholder="Operation, status, request, log ID..." />
  </label>

  <label>
    Sort by
    <select id="sortBy">
      ${option("StartTime", "Start time", filter.sortBy)}
      ${option("User", "User", filter.sortBy)}
      ${option("Operation", "Operation", filter.sortBy)}
      ${option("Status", "Status", filter.sortBy)}
      ${option("DurationMilliseconds", "Duration", filter.sortBy)}
      ${option("LogLength", "Size", filter.sortBy)}
    </select>
  </label>

  <label>
    Direction
    <select id="sortDirection">
      ${option("DESC", "Descending", filter.sortDirection)}
      ${option("ASC", "Ascending", filter.sortDirection)}
    </select>
  </label>

  <label>
    Max logs
    <input id="limit" type="number" min="1" max="2000" value="${filter.limit}" />
  </label>

  <button onclick="apply()">Apply Filters</button>
  <button onclick="clearFilters()" class="secondary">Clear Filters</button>

  <div class="hint">
    Dates and sort are applied to the Salesforce query. User and general search are also applied to loaded log metadata.
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function currentFilter() {
      return {
        fromDate: document.getElementById('fromDate').value,
        toDate: document.getElementById('toDate').value,
        userText: document.getElementById('userText').value,
        generalText: document.getElementById('generalText').value,
        sortBy: document.getElementById('sortBy').value,
        sortDirection: document.getElementById('sortDirection').value,
        limit: Number(document.getElementById('limit').value || 100)
      };
    }

    function apply() {
      vscode.postMessage({
        command: 'apply',
        filter: currentFilter()
      });
    }

    function clearFilters() {
      vscode.postMessage({
        command: 'clear'
      });
    }

    function sendPreset(command) {
      vscode.postMessage({
        command
      });
    }
  </script>
</body>
</html>`;
  }
}

function defaultFilter(): ApexLogFilter {
  return {
    limit: 100,
    fromDate: "",
    toDate: "",
    userText: "",
    generalText: "",
    sortBy: "StartTime",
    sortDirection: "DESC",
  };
}

function normaliseFilter(value: Partial<ApexLogFilter>): ApexLogFilter {
  const limit = Number(value.limit ?? 100);
  const sortBy = normaliseSortBy(value.sortBy);
  const sortDirection = normaliseSortDirection(value.sortDirection);

  return {
    fromDate: String(value.fromDate ?? "").trim(),
    toDate: String(value.toDate ?? "").trim(),
    userText: String(value.userText ?? "").trim(),
    generalText: String(value.generalText ?? "").trim(),
    sortBy,
    sortDirection,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 2000) : 100,
  };
}

function normaliseSortBy(value: unknown): ApexLogSortBy {
  const allowed: ApexLogSortBy[] = [
    "StartTime",
    "User",
    "Operation",
    "Status",
    "DurationMilliseconds",
    "LogLength",
  ];

  return allowed.includes(value as ApexLogSortBy)
    ? (value as ApexLogSortBy)
    : "StartTime";
}

function normaliseSortDirection(value: unknown): ApexLogSortDirection {
  return value === "ASC" ? "ASC" : "DESC";
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${escapeHtml(value)}" ${
    value === selected ? "selected" : ""
  }>${escapeHtml(label)}</option>`;
}
