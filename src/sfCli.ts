import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { SfAccess, SfOrg } from "./types";

const execFileAsync = promisify(execFile);

type Logger = (message: string) => void;

type SfRuntime = {
  sfCommand: string;
  env: NodeJS.ProcessEnv;
};

let cachedRuntime: SfRuntime | undefined;

export class SfCli {
  constructor(private readonly log: Logger) {}

  async listOrgs(): Promise<SfOrg[]> {
    const json = await this.runJson([
      "org",
      "list",
      "--json",
      "--all",
      "--skip-connection-status",
    ]);

    const result = json.result ?? {};
    const orgs: SfOrg[] = [];

    for (const key of [
      "nonScratchOrgs",
      "scratchOrgs",
      "sandboxes",
      "devHubs",
      "other",
    ] as const) {
      const value = result[key];

      if (Array.isArray(value)) {
        for (const org of value) {
          if (org.username) {
            orgs.push({
              alias: org.alias,
              username: org.username,
              orgId: org.orgId,
              instanceUrl: org.instanceUrl,
              loginUrl: org.loginUrl,
              isDefaultUsername: org.isDefaultUsername,
              connectedStatus: org.connectedStatus,
            });
          }
        }
      }
    }

    return uniqueByUsername(orgs);
  }

  async getAccess(targetOrg: string): Promise<SfAccess> {
    const displayJson = await this.runJson([
      "org",
      "display",
      "--target-org",
      targetOrg,
      "--json",
      "--verbose",
    ]);

    const result = displayJson.result ?? {};

    const accessToken = result.accessToken;
    const instanceUrl = result.instanceUrl;
    const username = result.username ?? targetOrg;

    if (!accessToken || !instanceUrl) {
      throw new Error(
        [
          `Could not resolve access token or instance URL for ${targetOrg}.`,
          "Tried: sf org display --target-org <org> --json --verbose",
          "Check that the org is authenticated locally and that the Salesforce CLI can display it.",
        ].join("\n"),
      );
    }

    return {
      username,
      accessToken,
      instanceUrl,
    };
  }

  async openOrg(targetOrg: string): Promise<void> {
    await this.run(["org", "open", "--target-org", targetOrg]);
  }

  private async runJson(args: string[]): Promise<any> {
    const { stdout } = await this.run(args);
    return JSON.parse(stdout);
  }

  private async run(
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const runtime = await resolveSfRuntime(this.log);

    this.log(`${runtime.sfCommand} ${args.join(" ")}`);
    this.log(`PATH used for Salesforce CLI: ${runtime.env.PATH ?? ""}`);

    try {
      const { stdout, stderr } = await execFileAsync(runtime.sfCommand, args, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        env: runtime.env,
      });

      if (stderr.trim()) {
        this.log(stderr.trim());
      }

      return {
        stdout,
        stderr,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(
        [
          "Failed to run Salesforce CLI.",
          `Command: ${runtime.sfCommand} ${args.join(" ")}`,
          message,
          "",
          "The extension tried to resolve sf from the VS Code process environment and from the user's login shell.",
          "Check that `sf --version` works in a normal Terminal session.",
        ].join("\n"),
      );
    }
  }
}

function uniqueByUsername(orgs: SfOrg[]): SfOrg[] {
  const seen = new Set<string>();
  const output: SfOrg[] = [];

  for (const org of orgs) {
    const key = org.username.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      output.push(org);
    }
  }

  return output;
}

async function resolveSfRuntime(log: Logger): Promise<SfRuntime> {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const processEnv = {
    ...process.env,
    PATH: normalisePath(process.env.PATH ?? ""),
  };

  const fromProcessPath = findExecutableOnPath("sf", processEnv.PATH ?? "");

  if (fromProcessPath) {
    cachedRuntime = {
      sfCommand: fromProcessPath,
      env: processEnv,
    };

    log(`Resolved Salesforce CLI from VS Code PATH: ${fromProcessPath}`);

    return cachedRuntime;
  }

  const shellEnv = await loadShellEnvironment(log);
  const mergedEnv = mergeEnvironments(processEnv, shellEnv);

  const fromShellPath = findExecutableOnPath("sf", mergedEnv.PATH ?? "");

  if (fromShellPath) {
    cachedRuntime = {
      sfCommand: fromShellPath,
      env: mergedEnv,
    };

    log(`Resolved Salesforce CLI from shell PATH: ${fromShellPath}`);

    return cachedRuntime;
  }

  const fromCommandV = await commandV("sf", mergedEnv, log);

  if (fromCommandV) {
    cachedRuntime = {
      sfCommand: fromCommandV,
      env: ensureCommandFolderOnPath(fromCommandV, mergedEnv),
    };

    log(`Resolved Salesforce CLI using command -v: ${fromCommandV}`);

    return cachedRuntime;
  }

  const fromCommonLocations = findFirstExistingExecutable([
    "/opt/homebrew/bin/sf",
    "/usr/local/bin/sf",
  ]);

  if (fromCommonLocations) {
    cachedRuntime = {
      sfCommand: fromCommonLocations,
      env: ensureCommandFolderOnPath(fromCommonLocations, mergedEnv),
    };

    log(`Resolved Salesforce CLI from common location: ${fromCommonLocations}`);

    return cachedRuntime;
  }

  cachedRuntime = {
    sfCommand: "sf",
    env: mergedEnv,
  };

  log(
    "Could not resolve an absolute Salesforce CLI path. Falling back to `sf`.",
  );

  return cachedRuntime;
}

async function loadShellEnvironment(log: Logger): Promise<NodeJS.ProcessEnv> {
  const shells = uniqueValues(
    [process.env.SHELL, "/bin/zsh", "/bin/bash"].filter(Boolean) as string[],
  );

  for (const shell of shells) {
    const attempts = [
      ["-lic", "env -0"],
      ["-lc", "env -0"],
    ];

    for (const args of attempts) {
      try {
        const { stdout } = await execFileAsync(shell, args, {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
          env: process.env,
        });

        const parsed = parseNullSeparatedEnv(stdout);

        if (parsed.PATH) {
          log(`Loaded shell environment from ${shell} ${args[0]}.`);
          return parsed;
        }
      } catch {
        // Try next shell/argument mode.
      }
    }
  }

  log(
    "Could not load shell environment. Using VS Code process environment only.",
  );

  return {};
}

async function commandV(
  command: string,
  env: NodeJS.ProcessEnv,
  log: Logger,
): Promise<string | undefined> {
  const shells = uniqueValues(
    [process.env.SHELL, "/bin/zsh", "/bin/bash"].filter(Boolean) as string[],
  );

  for (const shell of shells) {
    try {
      const { stdout } = await execFileAsync(
        shell,
        ["-lc", `command -v ${shellQuote(command)}`],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          env,
        },
      );

      const resolved = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .pop();

      if (resolved) {
        return resolved;
      }
    } catch {
      log(`Could not resolve ${command} with ${shell}.`);
    }
  }

  return undefined;
}

function parseNullSeparatedEnv(value: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const entry of value.split("\0")) {
    const index = entry.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key = entry.slice(0, index);
    const envValue = entry.slice(index + 1);

    env[key] = envValue;
  }

  return env;
}

function mergeEnvironments(
  base: NodeJS.ProcessEnv,
  shell: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const merged = {
    ...base,
    ...shell,
  };

  merged.PATH = normalisePath(
    [
      shell.PATH,
      base.PATH,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]
      .filter(Boolean)
      .join(path.delimiter),
  );

  return merged;
}

function ensureCommandFolderOnPath(
  commandPath: string,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (commandPath === "sf") {
    return env;
  }

  return {
    ...env,
    PATH: normalisePath(
      [path.dirname(commandPath), env.PATH ?? ""].join(path.delimiter),
    ),
  };
}

function normalisePath(value: string): string {
  return uniqueValues(
    value
      .split(path.delimiter)
      .map((part) => part.trim())
      .filter(Boolean),
  ).join(path.delimiter);
}

function findExecutableOnPath(
  executable: string,
  pathValue: string,
): string | undefined {
  const extensions =
    process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];

  for (const folder of pathValue.split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(folder, `${executable}${extension}`);

      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function findFirstExistingExecutable(paths: string[]): string | undefined {
  for (const candidate of paths) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }

  return output;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
