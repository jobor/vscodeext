// Copyright (C) 2023 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as vscode from 'vscode';

import * as local from '../util/localize';
import * as qtregister from './register-qt-path';
import * as util from '../util/util';

export async function selectQtPath() {
  const config = vscode.workspace.getConfiguration('vscode-qt-tools');
  let qtInstallations = config.get<string[]>('qtInstallations', []);

  if (qtInstallations.length === 0) {
    await qtregister.registerQt();
    qtInstallations = config.get<string[]>('qtInstallations', []);
  }

  if (qtInstallations.length !== 0) {
    // Show a quick pick dialog with the Qt installations as options
    const selected =
      qtInstallations.length === 1
        ? qtInstallations[0]
        : await vscode.window.showQuickPick(qtInstallations, {
            placeHolder: 'Select a default Qt installation'
          });

    // In the test mode, the selected is an object with the label and description
    // In the normal mode, the selected is a string
    let selectedInstallation: string;
    if (util.isTestMode() && typeof selected === 'object') {
      // convert object to vscode.QuickPickItem
      const item = selected as vscode.QuickPickItem;
      selectedInstallation = item.label;
    } else {
      selectedInstallation = selected ?? '';
    }

    if (selectedInstallation) {
      await Promise.all([
        config.update(
          'selectedQtPath',
          selectedInstallation,
          vscode.ConfigurationTarget.Workspace
        )
      ]);
    }
  }
}

function onQtInstallationsConfigUpdate(e: vscode.ConfigurationChangeEvent) {
  if (e.affectsConfiguration('vscode-qt-tools.qtInstallations')) {
    void selectQtPath();
  }
}

export function registerPickSelectedQtPathCommand(
  context: vscode.ExtensionContext
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'vscode-qt-tools.selectQtPath',
      selectQtPath
    ),
    vscode.workspace.onDidChangeConfiguration(onQtInstallationsConfigUpdate)
  );
}

export async function getSelectedQtInstallationPath(): Promise<string> {
  let selectedQtPath = vscode.workspace
    .getConfiguration('vscode-qt-tools')
    .get<string>('selectedQtPath', '');
  if (!selectedQtPath) {
    await selectQtPath();
    // Get the current configuration
    selectedQtPath = vscode.workspace
      .getConfiguration('vscode-qt-tools')
      .get<string>('selectedQtPath', '');
    if (!selectedQtPath) {
      local.warn(
        'Unable to locate Qt. Please, use "{0}" command to locate your Qt installation and try again.',
        qtregister.getRegisterQtCommandTitle()
      );
    }
  }
  return selectedQtPath;
}
