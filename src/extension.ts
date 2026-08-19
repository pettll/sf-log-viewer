import * as path from "path";
import * as vscode from "vscode";
import { LogDocumentProvider } from "./logDocumentProvider";
import { LogFilterViewProvider } from "./logFilterView";
import { SfClient } from "./sfClient";
import { SfCli } from "./sfCli";
import { TraceUserViewProvider } from "./traceUserView";
import {
  LogTreeItem,
  LogTreeProvider,
  OrgTreeItem,
  OrgTreeProvider,
} from "./treeProviders";
import {
  ApexLog,
  ApexLogFilter,
  DebugLevel,
  SfOrg,
  SfUser,
  TraceUserRequest,
} from "./types";

const output = vscode.window.createOutputChannel("SF Log Viewer");

let selectedOrg: SfOrg | undefined;
let selectedClient: SfClient | undefined;
let currentLogs: ApexLog[] = [];

let currentFilter: ApexLogFilter = {
  limit: 100,
  fromDate: "",
  toDate: "",
  userText: "",
  generalText: "",
  sortBy: "StartTime",
  sortDirection: "DESC",
};

export function activate(context: vscode.ExtensionContext): void {
  const log = (message: string) =>
    output.appendLine(`[${new Date().toISOString()}] ${message}`);

  const sfCli = new SfCli(log);
  const orgTree = new OrgTreeProvider();
  const logTree = new LogTreeProvider();
  const docs = new LogDocumentProvider();

  const defaultLimit =
    vscode.workspace
      .getConfiguration("sfLogs")
      .get<number>("defaultLogLimit") ?? 100;

  currentFilter = {
    ...currentFilter,
    limit: defaultLimit,
  };

  const filterView = new LogFilterViewProvider(
    currentFilter,
    async (filter) => {
      currentFilter = filter;
      logTree.setFilter(currentFilter);

      if (selectedOrg) {
        await vscode.commands.executeCommand("sfLogs.refreshLogs");
      }
    },
    async () => {
      currentFilter = {
        limit:
          vscode.workspace
            .getConfiguration("sfLogs")
            .get<number>("defaultLogLimit") ?? 100,
        fromDate: "",
        toDate: "",
        userText: "",
        generalText: "",
        sortBy: "StartTime",
        sortDirection: "DESC",
      };

      logTree.clearFilter();

      if (selectedOrg) {
        await vscode.commands.executeCommand("sfLogs.refreshLogs");
      }
    },
  );

  const traceView = new TraceUserViewProvider(
    async (search) => searchUsersForTrace(sfCli, log, search),
    async () => loadDebugLevelsForTrace(sfCli, log),
    async (request) => createOrExtendTraceForRequest(sfCli, log, request),
  );

  context.subscriptions.push(output);

  const orgView = vscode.window.createTreeView("sfLogs.orgs", {
    treeDataProvider: orgTree,
    showCollapseAll: false,
    canSelectMany: false,
  });

  context.subscriptions.push(orgView);

  context.subscriptions.push(
    orgView.onDidChangeCheckboxState(async (event) => {
      const first = event.items[0];

      if (!first) {
        return;
      }

      const item = first[0];

      await vscode.commands.executeCommand("sfLogs.selectOrg", item);
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TraceUserViewProvider.viewType,
      traceView,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LogFilterViewProvider.viewType,
      filterView,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("sfLogs.logs", logTree),
  );

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("sf-log", docs),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sfLogs.refreshOrgs", async () => {
      output.show(true);

      const orgs = await sfCli.listOrgs();

      selectedOrg = undefined;
      selectedClient = undefined;
      currentLogs = [];

      orgTree.setOrgs(orgs);
      orgTree.setSelectedOrg(undefined);
      logTree.setLogs([]);

      vscode.window.showInformationMessage(
        `Loaded ${orgs.length} Salesforce org(s). Select an org before refreshing logs.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sfLogs.selectOrg",
      async (item?: OrgTreeItem) => {
        const org = item?.org;

        if (!org) {
          vscode.window.showWarningMessage(
            "Select an org from the Authenticated Orgs view.",
          );
          return;
        }

        selectedClient = undefined;
        currentLogs = [];

        await selectOrg(org, sfCli, log);

        orgTree.setSelectedOrg(org);
        logTree.setLogs([]);

        vscode.window.showInformationMessage(
          `Selected Salesforce org: ${getOrgTarget(org)}`,
        );

        await vscode.commands.executeCommand("sfLogs.refreshLogs");
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sfLogs.openSelectedOrg",
      async (item?: OrgTreeItem) => {
        const org = item?.org ?? selectedOrg;

        if (!org) {
          vscode.window.showWarningMessage("No Salesforce org selected.");
          return;
        }

        await sfCli.openOrg(getOrgTarget(org));
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sfLogs.refreshLogs", async () => {
      output.show(true);

      if (!selectedOrg) {
        vscode.window.showWarningMessage(
          "Select a Salesforce org before refreshing logs.",
        );
        return;
      }

      const client = await getClient(sfCli, log);
      const logs = await client.getApexLogs(currentFilter);

      currentLogs = logs;

      logTree.setFilter(currentFilter);
      logTree.setLogs(logs);

      vscode.window.showInformationMessage(
        `Loaded ${logs.length} Apex log(s).`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sfLogs.openLog",
      async (item?: LogTreeItem) => {
        if (!item) {
          return;
        }

        output.show(true);

        const client = await getClient(sfCli, log);
        const body = await client.getApexLogBody(item.log.Id);
        const uri = vscode.Uri.parse(`sf-log:/${item.log.Id}.log`);

        docs.set(uri, body);

        const doc = await vscode.workspace.openTextDocument(uri);

        await vscode.window.showTextDocument(doc, {
          preview: false,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sfLogs.downloadLog",
      async (item?: LogTreeItem) => {
        if (!item) {
          vscode.window.showWarningMessage("Select a log to download.");
          return;
        }

        await downloadSingleLog(sfCli, log, item.log);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sfLogs.downloadAllLogs", async () => {
      await downloadAllLogs(sfCli, log);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sfLogs.filterLogs", async () => {
      vscode.window.showInformationMessage(
        "Use the Filters and Sort panel in the SF Logs view.",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sfLogs.clearFilter", async () => {
      currentFilter = {
        limit:
          vscode.workspace
            .getConfiguration("sfLogs")
            .get<number>("defaultLogLimit") ?? 100,
        fromDate: "",
        toDate: "",
        userText: "",
        generalText: "",
        sortBy: "StartTime",
        sortDirection: "DESC",
      };

      filterView.setFilter(currentFilter);
      logTree.clearFilter();

      if (selectedOrg) {
        await vscode.commands.executeCommand("sfLogs.refreshLogs");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sfLogs.createOrExtendTraceFlag",
      async () => {
        await createOrExtendTraceViaPrompt(sfCli, log);
      },
    ),
  );

  vscode.commands.executeCommand("sfLogs.refreshOrgs");
}

export function deactivate(): void {}

async function downloadSingleLog(
  sfCli: SfCli,
  log: (message: string) => void,
  apexLog: ApexLog,
): Promise<void> {
  output.show(true);

  const client = await getClient(sfCli, log);
  const body = await client.getApexLogBody(apexLog.Id);

  const defaultName = safeFileName(buildLogFileName(apexLog));

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
    filters: {
      "Apex log": ["log"],
      "Text file": ["txt"],
      "All files": ["*"],
    },
  });

  if (!saveUri) {
    return;
  }

  await vscode.workspace.fs.writeFile(saveUri, Buffer.from(body, "utf8"));

  vscode.window.showInformationMessage(`Downloaded Apex log ${apexLog.Id}.`);
}

async function downloadAllLogs(
  sfCli: SfCli,
  log: (message: string) => void,
): Promise<void> {
  output.show(true);

  if (!selectedOrg) {
    vscode.window.showWarningMessage(
      "Select a Salesforce org before downloading logs.",
    );
    return;
  }

  if (currentLogs.length === 0) {
    vscode.window.showWarningMessage(
      "No loaded logs to download. Refresh logs first.",
    );
    return;
  }

  const folder = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Save logs here",
  });

  if (!folder?.[0]) {
    return;
  }

  const client = await getClient(sfCli, log);
  const baseFolder = folder[0];

  const index = {
    selectedOrg,
    downloadedAt: new Date().toISOString(),
    count: currentLogs.length,
    logs: currentLogs,
  };

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(baseFolder, "apex-log-index.json"),
    Buffer.from(JSON.stringify(index, null, 2), "utf8"),
  );

  for (const apexLog of currentLogs) {
    const body = await client.getApexLogBody(apexLog.Id);

    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(baseFolder, safeFileName(buildLogFileName(apexLog))),
      Buffer.from(body, "utf8"),
    );
  }

  vscode.window.showInformationMessage(
    `Downloaded ${currentLogs.length} Apex log(s).`,
  );
}

async function searchUsersForTrace(
  sfCli: SfCli,
  log: (message: string) => void,
  search: string,
): Promise<SfUser[]> {
  if (!selectedOrg) {
    vscode.window.showWarningMessage(
      "Select a Salesforce org before searching users.",
    );
    return [];
  }

  const client = await getClient(sfCli, log);
  return client.searchUsers(search);
}

async function loadDebugLevelsForTrace(
  sfCli: SfCli,
  log: (message: string) => void,
): Promise<DebugLevel[]> {
  if (!selectedOrg) {
    vscode.window.showWarningMessage(
      "Select a Salesforce org before loading debug levels.",
    );
    return [];
  }

  const client = await getClient(sfCli, log);
  return client.listDebugLevels();
}

async function createOrExtendTraceForRequest(
  sfCli: SfCli,
  log: (message: string) => void,
  request: TraceUserRequest,
): Promise<void> {
  output.show(true);

  if (!selectedOrg) {
    vscode.window.showWarningMessage(
      "Select a Salesforce org before creating a trace flag.",
    );
    return;
  }

  if (!request.userId) {
    vscode.window.showWarningMessage("Select a user.");
    return;
  }

  if (!request.debugLevelId) {
    vscode.window.showWarningMessage("Select a debug level.");
    return;
  }

  if (!request.startDate || !request.expirationDate) {
    vscode.window.showWarningMessage("Set both start and end time.");
    return;
  }

  const client = await getClient(sfCli, log);

  const traceFlagId = await client.createOrExtendUserTraceFlag(
    request.userId,
    request.debugLevelId,
    request.startDate,
    request.expirationDate,
  );

  vscode.window.showInformationMessage(`Trace flag ready: ${traceFlagId}`);

  await vscode.commands.executeCommand("sfLogs.refreshLogs");
}

async function createOrExtendTraceViaPrompt(
  sfCli: SfCli,
  log: (message: string) => void,
): Promise<void> {
  if (!selectedOrg) {
    vscode.window.showWarningMessage(
      "Select a Salesforce org before creating a trace flag.",
    );
    return;
  }

  const client = await getClient(sfCli, log);

  const search = await vscode.window.showInputBox({
    prompt: "Search Salesforce user by name or username",
    ignoreFocusOut: true,
  });

  if (!search?.trim()) {
    return;
  }

  const users = await client.searchUsers(search);

  const pickedUser = await vscode.window.showQuickPick(
    users.map((user) => ({
      label: user.Name,
      description: user.Username,
      detail: user.Id,
      user,
    })),
    {
      placeHolder: "Choose user for trace flag",
    },
  );

  if (!pickedUser) {
    return;
  }

  const debugLevels = await client.listDebugLevels();

  const pickedDebugLevel = await vscode.window.showQuickPick(
    debugLevels.map((level) => ({
      label: level.MasterLabel || level.DeveloperName || level.Id,
      description: level.DeveloperName,
      detail: level.Id,
      level,
    })),
    {
      placeHolder: "Choose debug level",
    },
  );

  if (!pickedDebugLevel) {
    return;
  }

  const startDate = await vscode.window.showInputBox({
    prompt: "Start date/time",
    value: toLocalInputValue(new Date()),
    placeHolder: "YYYY-MM-DDTHH:mm",
    ignoreFocusOut: true,
  });

  if (!startDate) {
    return;
  }

  const expirationDate = await vscode.window.showInputBox({
    prompt: "End date/time",
    value: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    placeHolder: "YYYY-MM-DDTHH:mm",
    ignoreFocusOut: true,
  });

  if (!expirationDate) {
    return;
  }

  await createOrExtendTraceForRequest(sfCli, log, {
    userId: pickedUser.user.Id,
    debugLevelId: pickedDebugLevel.level.Id,
    startDate,
    expirationDate,
  });
}

async function getClient(
  sfCli: SfCli,
  log: (message: string) => void,
): Promise<SfClient> {
  if (selectedClient) {
    return selectedClient;
  }

  if (!selectedOrg) {
    throw new Error(
      "No Salesforce org selected. Select an org from the Authenticated Orgs view first.",
    );
  }

  return selectOrg(selectedOrg, sfCli, log);
}

async function selectOrg(
  org: SfOrg,
  sfCli: SfCli,
  log: (message: string) => void,
): Promise<SfClient> {
  selectedOrg = org;

  const target = getOrgTarget(org);

  log(`Selecting Salesforce org: ${target}`);

  const access = await sfCli.getAccess(target);

  const apiVersion =
    vscode.workspace.getConfiguration("sfLogs").get<string>("apiVersion") ??
    "60.0";

  selectedClient = new SfClient(access, apiVersion, log);

  log(`Selected org username: ${access.username}`);
  log(`Selected org instance URL: ${access.instanceUrl}`);

  return selectedClient;
}

function getOrgTarget(org: SfOrg): string {
  return org.alias || org.username;
}

function toLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function buildLogFileName(log: ApexLog): string {
  const started = log.StartTime
    ? new Date(log.StartTime).toISOString().replace(/[:.]/g, "-")
    : "unknown-time";

  const user = log.LogUser?.Username ?? log.LogUser?.Name ?? "unknown-user";
  const operation = log.Operation ?? "operation";

  return `${started} - ${user} - ${operation} - ${log.Id}.log`;
}

function safeFileName(value: string): string {
  return path
    .basename(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
