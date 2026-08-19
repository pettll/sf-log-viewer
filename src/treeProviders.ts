import * as vscode from "vscode";
import { ApexLog, ApexLogFilter, SfOrg } from "./types";

export class OrgTreeItem extends vscode.TreeItem {
  constructor(
    public readonly org: SfOrg,
    selectedUsername?: string,
  ) {
    super(
      org.alias ? `${org.alias} (${org.username})` : org.username,
      vscode.TreeItemCollapsibleState.None,
    );

    const isSelected = selectedUsername === org.username;

    this.description = isSelected
      ? "Selected"
      : (org.instanceUrl ?? org.connectedStatus ?? "");

    this.contextValue = "sfOrg";
    this.iconPath = new vscode.ThemeIcon(isSelected ? "check" : "cloud");

    this.checkboxState = isSelected
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    this.tooltip = [
      isSelected ? "Selected org" : undefined,
      org.alias ? `Alias: ${org.alias}` : undefined,
      `Username: ${org.username}`,
      org.orgId ? `Org ID: ${org.orgId}` : undefined,
      org.instanceUrl ? `Instance: ${org.instanceUrl}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    this.command = {
      command: "sfLogs.selectOrg",
      title: "Select Org",
      arguments: [this],
    };
  }
}

export class OrgTreeProvider implements vscode.TreeDataProvider<OrgTreeItem> {
  private orgs: SfOrg[] = [];
  private selectedUsername: string | undefined;

  private readonly emitter = new vscode.EventEmitter<OrgTreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  setOrgs(orgs: SfOrg[]): void {
    this.orgs = orgs;
    this.emitter.fire(undefined);
  }

  setSelectedOrg(org: SfOrg | undefined): void {
    this.selectedUsername = org?.username;
    this.emitter.fire(undefined);
  }

  getFirstOrg(): SfOrg | undefined {
    return this.orgs[0];
  }

  getTreeItem(element: OrgTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): OrgTreeItem[] {
    return this.orgs.map((org) => new OrgTreeItem(org, this.selectedUsername));
  }
}

export class LogTreeItem extends vscode.TreeItem {
  constructor(public readonly log: ApexLog) {
    const user = log.LogUser?.Name ?? log.LogUser?.Username ?? "Unknown user";
    const time = log.StartTime
      ? new Date(log.StartTime).toLocaleString()
      : "Unknown time";

    super(`${time} - ${user}`, vscode.TreeItemCollapsibleState.None);

    this.description = [
      log.Operation,
      log.Status,
      log.DurationMilliseconds !== undefined
        ? `${log.DurationMilliseconds} ms`
        : undefined,
      log.LogLength ? `${log.LogLength} bytes` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");

    this.contextValue = "sfLog";

    this.iconPath = new vscode.ThemeIcon(
      log.Status === "Success" ? "check" : "output",
    );

    this.tooltip = JSON.stringify(log, null, 2);

    this.command = {
      command: "sfLogs.openLog",
      title: "Open Log",
      arguments: [this],
    };
  }
}

export class LogTreeProvider implements vscode.TreeDataProvider<LogTreeItem> {
  private logs: ApexLog[] = [];
  private filter: ApexLogFilter = {};

  private readonly emitter = new vscode.EventEmitter<LogTreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  setLogs(logs: ApexLog[]): void {
    this.logs = logs;
    this.emitter.fire(undefined);
  }

  setFilter(filter: ApexLogFilter): void {
    this.filter = filter;
    this.emitter.fire(undefined);
  }

  clearFilter(): void {
    this.filter = {};
    this.emitter.fire(undefined);
  }

  getTreeItem(element: LogTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): LogTreeItem[] {
    const filtered = this.logs.filter((log) =>
      matchesClientFilter(log, this.filter),
    );

    return filtered.map((log) => new LogTreeItem(log));
  }
}

function matchesClientFilter(log: ApexLog, filter: ApexLogFilter): boolean {
  const user = [log.LogUser?.Name, log.LogUser?.Username, log.LogUserId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const general = JSON.stringify(log).toLowerCase();

  if (filter.userText?.trim()) {
    const value = filter.userText.trim().toLowerCase();

    if (!user.includes(value)) {
      return false;
    }
  }

  if (filter.generalText?.trim()) {
    const value = filter.generalText.trim().toLowerCase();

    if (!general.includes(value)) {
      return false;
    }
  }

  return true;
}
