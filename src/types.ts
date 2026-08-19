export type SfOrg = {
  alias?: string;
  username: string;
  orgId?: string;
  instanceUrl?: string;
  loginUrl?: string;
  isDefaultUsername?: boolean;
  connectedStatus?: string;
};

export type SfAccess = {
  username: string;
  accessToken: string;
  instanceUrl: string;
};

export type ApexLog = {
  Id: string;
  Application?: string;
  DurationMilliseconds?: number;
  Location?: string;
  LogLength?: number;
  LogUserId?: string;
  LogUser?: {
    Name?: string;
    Username?: string;
  };
  Operation?: string;
  Request?: string;
  StartTime?: string;
  Status?: string;
};

export type ApexLogSortBy =
  | "StartTime"
  | "User"
  | "Operation"
  | "Status"
  | "DurationMilliseconds"
  | "LogLength";

export type ApexLogSortDirection = "ASC" | "DESC";

export type ApexLogFilter = {
  fromDate?: string;
  toDate?: string;
  userText?: string;
  generalText?: string;
  limit?: number;
  sortBy?: ApexLogSortBy;
  sortDirection?: ApexLogSortDirection;
};

export type SfUser = {
  Id: string;
  Name: string;
  Username: string;
};

export type DebugLevel = {
  Id: string;
  DeveloperName?: string;
  MasterLabel?: string;
};

export type TraceFlag = {
  Id: string;
  TracedEntityId: string;
  DebugLevelId: string;
  StartDate: string;
  ExpirationDate: string;
  LogType: string;
};

export type TraceUserRequest = {
  userId: string;
  debugLevelId: string;
  startDate: string;
  expirationDate: string;
};
