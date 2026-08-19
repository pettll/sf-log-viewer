import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";
import { SfAccess, SfOrg } from "./types";

const execFileAsync = promisify(execFile);

type Logger = (message: string) => void;

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
    const sfCommand = resolveSfCommand();
    const env = buildSfEnv(sfCommand);

    this.log(`${sfCommand} ${args.join(" ")}`);
    this.log(`PATH used for Salesforce CLI: ${env.PATH}`);

    const { stdout, stderr } = await execFileAsync(sfCommand, args, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env,
    });

    if (stderr.trim()) {
      this.log(stderr.trim());
    }

    return {
      stdout,
      stderr,
    };
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

function resolveSfCommand(): string {
  const configured = process.env.SF_LOG_VIEWER_SF_PATH;

  if (configured?.trim()) {
    return configured.trim();
  }

  return "sf";
}

function buildSfEnv(sfCommand: string): NodeJS.ProcessEnv {
  const existingPath = process.env.PATH ?? "";
  const extraPaths: string[] = [];

  if (sfCommand !== "sf") {
    extraPaths.push(path.dirname(sfCommand));
  }

  const configuredNodePath = process.env.SF_LOG_VIEWER_NODE_PATH;

  if (configuredNodePath?.trim()) {
    extraPaths.push(configuredNodePath.trim());
  }

  return {
    ...process.env,
    PATH: [...extraPaths, existingPath].filter(Boolean).join(path.delimiter),
  };
}
