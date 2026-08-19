import {
  ApexLog,
  ApexLogFilter,
  DebugLevel,
  SfAccess,
  SfUser,
  TraceFlag,
} from "./types";

type Logger = (message: string) => void;

export class SfClient {
  constructor(
    private readonly access: SfAccess,
    private readonly apiVersion: string,
    private readonly log: Logger,
  ) {}

  async queryTooling<T>(soql: string): Promise<T[]> {
    const url =
      `${this.access.instanceUrl}/services/data/v${this.apiVersion}/tooling/query/?q=` +
      encodeURIComponent(soql);

    const result = await this.request<{ records?: T[] }>(url, {
      method: "GET",
    });

    return result.records ?? [];
  }

  async queryData<T>(soql: string): Promise<T[]> {
    const url =
      `${this.access.instanceUrl}/services/data/v${this.apiVersion}/query/?q=` +
      encodeURIComponent(soql);

    const result = await this.request<{ records?: T[] }>(url, {
      method: "GET",
    });

    return result.records ?? [];
  }

  async getApexLogs(filter: ApexLogFilter): Promise<ApexLog[]> {
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 2000));
    const where: string[] = [];

    if (filter.fromDate?.trim()) {
      where.push(
        `StartTime >= ${toSalesforceDateTime(filter.fromDate.trim(), "start")}`,
      );
    }

    if (filter.toDate?.trim()) {
      where.push(
        `StartTime <= ${toSalesforceDateTime(filter.toDate.trim(), "end")}`,
      );
    }

    const sortBy = toLogSortField(filter.sortBy);
    const sortDirection = filter.sortDirection === "ASC" ? "ASC" : "DESC";

    const soql = [
      "SELECT Id, Application, DurationMilliseconds, Location, LogLength, LogUserId, LogUser.Name, LogUser.Username, Operation, Request, StartTime, Status",
      "FROM ApexLog",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY ${sortBy} ${sortDirection}`,
      `LIMIT ${limit}`,
    ]
      .filter(Boolean)
      .join(" ");

    const logs = await this.queryTooling<ApexLog>(soql);

    return logs.filter((log) => {
      const userText = filter.userText?.trim().toLowerCase();
      const generalText = filter.generalText?.trim().toLowerCase();

      if (userText) {
        const userHaystack = [
          log.LogUser?.Name,
          log.LogUser?.Username,
          log.LogUserId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!userHaystack.includes(userText)) {
          return false;
        }
      }

      if (generalText) {
        const generalHaystack = JSON.stringify(log).toLowerCase();

        if (!generalHaystack.includes(generalText)) {
          return false;
        }
      }

      return true;
    });
  }

  async getApexLogBody(logId: string): Promise<string> {
    const url = `${this.access.instanceUrl}/services/data/v${this.apiVersion}/tooling/sobjects/ApexLog/${logId}/Body`;

    return this.requestText(url, {
      method: "GET",
    });
  }

  async searchUsers(search: string): Promise<SfUser[]> {
    const trimmed = search.trim();

    if (!trimmed) {
      return [];
    }

    const escaped = escapeSoql(trimmed);

    const soql = [
      "SELECT Id, Name, Username",
      "FROM User",
      "WHERE IsActive = true",
      `AND (Name LIKE '%${escaped}%' OR Username LIKE '%${escaped}%')`,
      "ORDER BY Name",
      "LIMIT 50",
    ].join(" ");

    const users = await this.queryData<SfUser>(soql);

    this.log(`User search '${trimmed}' returned ${users.length} result(s).`);

    return users;
  }

  async listDebugLevels(): Promise<DebugLevel[]> {
    const levels = await this.queryTooling<DebugLevel>(
      [
        "SELECT Id, DeveloperName, MasterLabel",
        "FROM DebugLevel",
        "ORDER BY DeveloperName",
        "LIMIT 200",
      ].join(" "),
    );

    this.log(`Loaded ${levels.length} debug level(s).`);

    return levels;
  }

  async createOrExtendUserTraceFlag(
    userId: string,
    debugLevelId: string,
    startDate: string,
    expirationDate: string,
  ): Promise<string> {
    const start = toApiDateTime(startDate);
    const expires = toApiDateTime(expirationDate);

    const existing = await this.queryTooling<TraceFlag>(
      [
        "SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType",
        "FROM TraceFlag",
        `WHERE TracedEntityId = '${escapeSoql(userId)}'`,
        "AND LogType = 'USER_DEBUG'",
        "ORDER BY ExpirationDate DESC",
        "LIMIT 1",
      ].join(" "),
    );

    if (existing[0]?.Id) {
      await this.patchTooling("TraceFlag", existing[0].Id, {
        StartDate: start,
        ExpirationDate: expires,
        DebugLevelId: debugLevelId,
      });

      return existing[0].Id;
    }

    const created = await this.createTooling("TraceFlag", {
      TracedEntityId: userId,
      LogType: "USER_DEBUG",
      DebugLevelId: debugLevelId,
      StartDate: start,
      ExpirationDate: expires,
    });

    return created.id;
  }

  private async createTooling(
    sobject: string,
    body: unknown,
  ): Promise<{ id: string; success: boolean }> {
    const url = `${this.access.instanceUrl}/services/data/v${this.apiVersion}/tooling/sobjects/${sobject}/`;

    return this.request<{ id: string; success: boolean }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async patchTooling(
    sobject: string,
    id: string,
    body: unknown,
  ): Promise<void> {
    const url = `${this.access.instanceUrl}/services/data/v${this.apiVersion}/tooling/sobjects/${sobject}/${id}`;

    await this.requestText(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const text = await this.requestText(url, init);
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async requestText(url: string, init: RequestInit): Promise<string> {
    this.log(`${init.method ?? "GET"} ${url}`);

    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${this.access.accessToken}`,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        [
          `Salesforce request failed: ${response.status} ${response.statusText}`,
          url,
          text,
        ].join("\n"),
      );
    }

    return text;
  }
}

function toSalesforceDateTime(value: string, mode: "start" | "end"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return mode === "start"
      ? `${value}T00:00:00.000+0000`
      : `${value}T23:59:59.999+0000`;
  }

  return value;
}

function toApiDateTime(value: string): string {
  if (!value.trim()) {
    throw new Error("Start and end date/time are required.");
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date/time value: ${value}`);
  }

  return parsed.toISOString();
}

function toLogSortField(value: ApexLogFilter["sortBy"]): string {
  switch (value) {
    case "User":
      return "LogUser.Name";
    case "Operation":
      return "Operation";
    case "Status":
      return "Status";
    case "DurationMilliseconds":
      return "DurationMilliseconds";
    case "LogLength":
      return "LogLength";
    case "StartTime":
    default:
      return "StartTime";
  }
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
