import * as vscode from "vscode";
import { DebugLevel, SfUser, TraceUserRequest } from "./types";

type SearchUsers = (search: string) => Promise<SfUser[]>;
type LoadDebugLevels = () => Promise<DebugLevel[]>;
type CreateTrace = (request: TraceUserRequest) => Promise<void>;

export class TraceUserViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "sfLogs.trace";

  private view?: vscode.WebviewView;
  private users: SfUser[] = [];
  private debugLevels: DebugLevel[] = [];
  private userSearch = "";
  private selectedUserId = "";
  private selectedDebugLevelId = "";
  private status = "";

  constructor(
    private readonly searchUsers: SearchUsers,
    private readonly loadDebugLevels: LoadDebugLevels,
    private readonly createTrace: CreateTrace,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.command === "loadDebugLevels") {
          this.status = "Loading debug levels...";
          this.refresh();

          this.debugLevels = await this.loadDebugLevels();

          if (!this.selectedDebugLevelId && this.debugLevels[0]?.Id) {
            this.selectedDebugLevelId = this.debugLevels[0].Id;
          }

          this.status = `Loaded ${this.debugLevels.length} debug level(s).`;
          this.refresh();
        }

        if (message.command === "searchUsers") {
          this.userSearch = String(message.search ?? "").trim();
          this.selectedUserId = "";

          if (!this.userSearch) {
            this.users = [];
            this.status = "Enter a user search term.";
            this.refresh();
            return;
          }

          this.status = `Searching users for '${this.userSearch}'...`;
          this.refresh();

          this.users = await this.searchUsers(this.userSearch);

          if (this.users[0]?.Id) {
            this.selectedUserId = this.users[0].Id;
          }

          this.status = `Found ${this.users.length} user(s).`;
          this.refresh();
        }

        if (message.command === "selectionChanged") {
          this.selectedUserId = String(message.userId ?? "");
          this.selectedDebugLevelId = String(message.debugLevelId ?? "");
        }

        if (message.command === "createTrace") {
          const request = normaliseRequest(message.request);
          this.selectedUserId = request.userId;
          this.selectedDebugLevelId = request.debugLevelId;

          this.status = "Creating or extending trace flag...";
          this.refresh();

          await this.createTrace(request);

          this.status = "Trace flag created or extended.";
          this.refresh();
        }
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);

        this.status = messageText;
        this.refresh();

        vscode.window.showErrorMessage(messageText);
      }
    });
  }

  refresh(): void {
    if (this.view) {
      this.view.webview.html = this.getHtml();
    }
  }

  private getHtml(): string {
    const defaultStart = toLocalInputValue(new Date());
    const defaultEnd = toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000));

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

    .hint {
      margin-top: 8px;
      opacity: 0.75;
      font-size: 11px;
      line-height: 1.35;
    }

    .status {
      margin-top: 8px;
      font-size: 11px;
      opacity: 0.9;
      white-space: pre-wrap;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 6px;
      align-items: end;
    }
  </style>
</head>
<body>
  <button onclick="loadDebugLevels()" class="secondary">
    Load Debug Levels
  </button>

  <label>
    Debug level
    <select id="debugLevelId" onchange="selectionChanged()">
      ${this.debugLevels.length === 0 ? `<option value="">Load debug levels first</option>` : ""}
      ${this.debugLevels
        .map((level) =>
          option(
            level.Id,
            level.MasterLabel || level.DeveloperName || level.Id,
            this.selectedDebugLevelId,
          ),
        )
        .join("")}
    </select>
  </label>

  <label>
    Search user
    <div class="row">
      <input id="userSearch" type="text" value="${escapeHtml(this.userSearch)}" placeholder="Name or username" onkeydown="if(event.key === 'Enter') searchUsers()" />
      <button onclick="searchUsers()" class="secondary">Search</button>
    </div>
  </label>

  <label>
    User
    <select id="userId" onchange="selectionChanged()">
      ${
        this.users.length === 0
          ? `<option value="">${this.userSearch ? "No users found" : "Search for a user first"}</option>`
          : ""
      }
      ${this.users
        .map((user) =>
          option(
            user.Id,
            `${user.Name} (${user.Username})`,
            this.selectedUserId,
          ),
        )
        .join("")}
    </select>
  </label>

  <label>
    Start time
    <input id="startDate" type="datetime-local" value="${defaultStart}" />
  </label>

  <label>
    End time
    <input id="expirationDate" type="datetime-local" value="${defaultEnd}" />
  </label>

  <button onclick="createTrace()">Create or Extend Trace</button>

  <div class="hint">
    Select a user and debug level, then set the exact start and end time for the USER_DEBUG trace flag.
  </div>

  <div class="status">
    ${escapeHtml(this.status)}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function loadDebugLevels() {
      vscode.postMessage({
        command: 'loadDebugLevels'
      });
    }

    function searchUsers() {
      vscode.postMessage({
        command: 'searchUsers',
        search: document.getElementById('userSearch').value
      });
    }

    function selectionChanged() {
      vscode.postMessage({
        command: 'selectionChanged',
        userId: document.getElementById('userId').value,
        debugLevelId: document.getElementById('debugLevelId').value
      });
    }

    function createTrace() {
      vscode.postMessage({
        command: 'createTrace',
        request: {
          userId: document.getElementById('userId').value,
          debugLevelId: document.getElementById('debugLevelId').value,
          startDate: document.getElementById('startDate').value,
          expirationDate: document.getElementById('expirationDate').value
        }
      });
    }
  </script>
</body>
</html>`;
  }
}

function normaliseRequest(value: Partial<TraceUserRequest>): TraceUserRequest {
  return {
    userId: String(value.userId ?? "").trim(),
    debugLevelId: String(value.debugLevelId ?? "").trim(),
    startDate: String(value.startDate ?? "").trim(),
    expirationDate: String(value.expirationDate ?? "").trim(),
  };
}

function option(value: string, label: string, selectedValue: string): string {
  return `<option value="${escapeHtml(value)}" ${
    value === selectedValue ? "selected" : ""
  }>${escapeHtml(label)}</option>`;
}

function toLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
