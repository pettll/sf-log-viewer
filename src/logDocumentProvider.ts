import * as vscode from "vscode";

export class LogDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly logs = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.emitter.event;

  set(uri: vscode.Uri, content: string): void {
    this.logs.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.logs.get(uri.toString()) ?? "Log not loaded.";
  }
}
