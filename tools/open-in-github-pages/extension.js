'use strict';

const vscode = require('vscode');
const { execSync } = require('child_process');

function getGitHubPagesBaseUrl(workspacePath) {
  let remote;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: workspacePath,
      timeout: 5000,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }

  // SSH:   git@github.com:owner/repo.git
  // HTTPS: https://github.com/owner/repo.git
  const sshMatch = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  const httpsMatch = remote.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  const match = sshMatch || httpsMatch;
  if (!match) return null;

  const [, owner, repo] = match;
  return `https://${owner}.github.io/${repo}/`;
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('open-in-github-pages.open', (uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showWarningMessage('Open in GitHub Pages: no HTML file selected.');
        return;
      }

      const folder = vscode.workspace.getWorkspaceFolder(target);
      if (!folder) {
        vscode.window.showWarningMessage('Open in GitHub Pages: file is outside the workspace.');
        return;
      }

      const baseUrl = getGitHubPagesBaseUrl(folder.uri.fsPath);
      if (!baseUrl) {
        vscode.window.showWarningMessage(
          'Open in GitHub Pages: could not determine GitHub Pages URL. ' +
          'Make sure the workspace has a GitHub remote named "origin".'
        );
        return;
      }

      const root = folder.uri.fsPath;
      const rel = target.fsPath.slice(root.length + 1).replace(/\\/g, '/');
      const url = baseUrl + rel;

      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
