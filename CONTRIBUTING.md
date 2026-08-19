# Contributing to SF Log Viewer

Thank you for your interest in contributing to **SF Log Viewer**! This document provides guidelines and instructions for setting up your development environment, building the extension, debugging, and packaging the extension for testing.

---

## Prerequisites

Before getting started, ensure you have the following installed on your machine:

- **Visual Studio Code** or **Visual Studio Code Insiders**
- **Node.js** (v18 or higher recommended)
- **npm**
- **Salesforce CLI** installed and accessible in your environment as `sf`

Verify your Salesforce CLI installation:

```bash
which sf
sf --version
```

Make sure you have at least one authenticated Salesforce org to test against:

```bash
sf org login web --alias my-org
sf org list --json
```

---

## Project Structure

```text
sf-log-viewer/
├── .vscode/
│   ├── launch.json       # VS Code debug configurations
│   └── tasks.json        # Build and compile tasks
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── logDocumentProvider.ts# Virtual document provider for log viewer
│   ├── logFilterView.ts      # Filters and sorting webview/tree provider
│   ├── sfCli.ts              # Salesforce CLI wrapper & org loader
│   ├── sfClient.ts           # Salesforce Tooling API client
│   ├── traceUserView.ts      # Trace flag creation & user search provider
│   ├── treeProviders.ts      # Activity Bar tree views (Orgs, Logs)
│   └── types.ts              # TypeScript interfaces and data models
├── package.json          # Extension manifest & scripts
├── tsconfig.json         # TypeScript compiler configuration
├── README.md             # Extension marketplace documentation
├── CONTRIBUTING.md       # Developer and setup guide
├── .gitignore
└── .vscodeignore
```

---

## Development Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/pettll/sf-log-viewer.git
   cd sf-log-viewer
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Compile the Extension:**
   ```bash
   npm run compile
   ```
   Or run the watch mode during development:
   ```bash
   npm run watch
   ```

4. **Open in VS Code:**
   ```bash
   code .
   ```
   *(Or `code-insiders .` if using VS Code Insiders)*

---

## Debugging in VS Code

1. Open the project in VS Code.
2. Press **F5** (or go to **Run and Debug** in the Activity Bar and click **Run Extension**).
3. A new **Extension Development Host** window will open with the extension loaded.

### Environment Path Configuration (`launch.json`)

If the Salesforce CLI is installed via `nvm` or a non-standard shell path, VS Code's Extension Host process may not inherit your terminal's `PATH`. You can configure explicit paths in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile",
      "env": {
        "SF_LOG_VIEWER_SF_PATH": "/path/to/your/bin/sf",
        "SF_LOG_VIEWER_NODE_PATH": "/path/to/your/bin"
      }
    }
  ]
}
```

---

## Packaging as VSIX

To build a standalone `.vsix` package for manual installation or marketplace publication:

1. **Install `@vscode/vsce`** (if not already installed):
   ```bash
   npm install --save-dev @vscode/vsce
   ```

2. **Compile and Package:**
   ```bash
   npm run compile
   npx vsce package
   ```
   *(Or use the project npm script: `npm run package:vsix:dist`)*

3. **Install the Generated VSIX Locally:**
   ```bash
   code --install-extension dist/sf-log-viewer-0.0.1.vsix --force
   ```
   *(For VS Code Insiders: `code-insiders --install-extension dist/sf-log-viewer-0.0.1.vsix --force`)*

---

## Pull Request Guidelines

1. **Create a Feature Branch:** `git checkout -b feature/my-new-feature` or `fix/issue-description`.
2. **Ensure Code Compiles:** Run `npm run compile` and make sure there are no TypeScript or linting errors.
3. **Commit Cleanly:** Use clear, descriptive commit messages.
4. **Submit PR:** Open a Pull Request against the `main` branch with a summary of changes and test steps.