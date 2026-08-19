# SF Log Viewer

SF Log Viewer is a Visual Studio Code extension for viewing Salesforce Apex logs across locally authenticated Salesforce CLI orgs.

The extension uses the local Salesforce CLI authentication already available on the developer machine. Users do not need to paste Salesforce access tokens into VS Code.

## Features

- Lists locally authenticated Salesforce orgs from the Salesforce CLI.

- Lets the user select one active org from the extension side panel.

- Fetches recent Apex logs from the selected org through the Salesforce Tooling API.

- Opens Apex log bodies directly inside VS Code.

- Filters logs by date range, user and general search text.

- Sorts logs by start time, user, operation, status, duration or size.

- Downloads a single Apex log to a chosen file location.

- Downloads all currently loaded Apex logs to a chosen folder.

- Creates or extends user trace flags.

- Queries available `DebugLevel` records from the selected org.

- Searches active Salesforce users by name or username.

- Lets the user choose the user, debug level, start time and end time for `USER_DEBUG` trace flags.

## Requirements

- Visual Studio Code or Visual Studio Code Insiders.

- Node.js.

- npm.

- Salesforce CLI installed as `sf`.

- At least one authenticated Salesforce org.

Check the Salesforce CLI:

which sf
sf --version

Authenticate an org if needed:

sf org login web --alias my-org
sf org list --json

## Project structure

```
sf-log-viewer/
├── .vscode/
│ ├── launch.json
│ └── tasks.json
├── src/
│ ├── extension.ts
│ ├── logDocumentProvider.ts
│ ├── logFilterView.ts
│ ├── sfCli.ts
│ ├── sfClient.ts
│ ├── traceUserView.ts
│ ├── treeProviders.ts
│ └── types.ts
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
└── .vscodeignore
```

## Development setup

Install dependencies:

`npm install`

Compile:

`npm run compile`

Open in VS Code Insiders:

`code-insiders .`

Or open in VS Code:

`code .`

Press F5 to launch the Extension Development Host.

## VS Code launch configuration

If Salesforce CLI is installed through nvm, VS Code may not inherit the same terminal PATH. Set the Salesforce CLI path and Node path in .vscode/launch.json.

Example:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile",
      "env": {
        "SF_LOG_VIEWER_SF_PATH": "/Users/pemuller/.nvm/versions/node/v24.11.1/bin/sf",
        "SF_LOG_VIEWER_NODE_PATH": "/Users/pemuller/.nvm/versions/node/v24.11.1/bin"
      }
    }
  ]
}
```

## Main commands

Open the Command Palette and search for SF Logs.

```
SF Logs: Refresh Orgs
SF Logs: Select Org
SF Logs: Refresh Logs
SF Logs: Open Log
SF Logs: Download Log
SF Logs: Download All Logs
SF Logs: Show Filters
SF Logs: Clear Filters
SF Logs: Create or Extend Trace Flag
SF Logs: Open Selected Org
```

## Extension views

The extension adds an SF Logs activity bar item with these views:

1. `Authenticated Orgs`

2. `Trace User`

3. `Filters and Sort`

4. `Apex Logs`

## Using the extension

1. Run `SF Logs: Refresh Orgs`.

2. Select an org from `Authenticated Orgs`.

3. Use `Trace User` to create or extend a user trace flag.

4. Use `Filters and Sort` to choose date range, user/general filter, sort field and sort direction.

5. Run `SF Logs: Refresh Logs` or apply filters from the panel.

6. Select a log under `Apex Logs` to open it.

7. Use `Download Log` to save one log.

8. Use `Download All Logs` to save all currently loaded logs.

## Trace User workflow

1. Select an org.

2. In `Trace User`, select `Load Debug Levels`.

3. Search for a user by name or username.

4. Select a user from the dropdown.

5. Select a debug level from the dropdown.

6. Set start and end time.

7. Select `Create or Extend Trace`.

The extension creates or extends a USER_DEBUG trace flag for the selected user.

## Filters and Sort workflow

Use the `Filters and Sort` panel to set:

- From date.

- To date.

- User text filter.

- General text filter.

- Sort field.

- Sort direction.

- Maximum number of logs.

Available sort fields:

- Start time.

- User.

- Operation.

- Status.

- Duration.

- Size.

## Downloaded log files

Single log download:

`<chosen-file>.log`

Download all logs:

```
<chosen-folder>/
apex-log-index.json
<start-time> - <user> - <operation> - <log-id>.log
```

The apex-log-index.json file contains metadata for the downloaded result set.

## Packaging as VSIX

Install the packaging tool if needed:

`npm install --save-dev @vscode/vsce`

Package:

```bash
npm run compile
npx vsce package
```

Or use the project script:

`npm run package:vsix:dist`

Install locally in VS Code Insiders:

`code-insiders --install-extension dist/sf-log-viewer-0.0.1.vsix --force`

Install locally in VS Code:

`code --install-extension dist/sf-log-viewer-0.0.1.vsix --force`
