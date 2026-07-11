'use strict';

const vscode = require('vscode');

const BASE_URL = 'https://sugarsmax.github.io/lastfm_artist_discovery/';

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

      const root = folder.uri.fsPath;
      const rel = target.fsPath.slice(root.length + 1).replace(/\\/g, '/');
      const url = BASE_URL + rel;

      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
