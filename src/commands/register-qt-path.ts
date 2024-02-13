// Copyright (C) 2023 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as vscode from 'vscode';

import * as qtpath from '../util/get-qt-paths';
import * as local from '../util/localize';
import * as util from '../util/util';

export const RegisterQtCommandId = 'vscode-qt-tools.registerQt';
let RegisterQtCommandTitle = '';

export function getRegisterQtCommandTitle(): string {
  return RegisterQtCommandTitle;
}

async function gotInstallationSets(
  qtInstallationPromises: Promise<string[]>[],
  filePaths: string[]
) {
  const qtInstallationSets = await Promise.all(qtInstallationPromises);
  const qtInstallations = ([] as string[]).concat.apply([], qtInstallationSets);
  if (qtInstallations.length === 0) {
    void vscode.window.showInformationMessage(
      `Found no any Qt environments in the specified installation.`
    );
    console.log('Found no any Qt environments in the specified installation.');
  } else {
    void vscode.window.showInformationMessage(
      `Found ${qtInstallations.length} Qt installation(s).`
    );
    console.log(`Found ${qtInstallations.length} Qt installation(s).`);
    const config = vscode.workspace.getConfiguration('vscode-qt-tools');
    const configTarget = util.isTestMode()
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await Promise.all([
      config.update('qtFolders', filePaths, configTarget),
      config.update('qtInstallations', qtInstallations, configTarget)
    ]);
  }
}

async function saveSelectedQt(fileUris: vscode.Uri[]) {
  if (fileUris.length !== 0) {
    const qtInstallationPromises = fileUris.map((uri) =>
      qtpath.findQtInstallations(uri.fsPath)
    );
    await gotInstallationSets(
      qtInstallationPromises,
      fileUris.map((uri) => uri.fsPath)
    );
  }
}

// This is a placeholder for the actual implementation of the 'vscode-qt-tools.registerQt' command.
// Replace this with the actual code that was previously in 'extension.ts'.
export async function registerQt() {
  // If no default Qt installation is registered, ask the user to register one
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: 'Select The Qt installation path',
    canSelectFiles: false,
    canSelectFolders: true
  };
  const selectedQtFolder = await vscode.window.showOpenDialog(options);
  if (selectedQtFolder) {
    await saveSelectedQt(selectedQtFolder);
  }
  return 0;
}

export async function checkForQtInstallationsUpdates() {
  const qtFolders =
    vscode.workspace
      .getConfiguration('vscode-qt-tools')
      .get<string[]>('qtFolders') ?? [];

  const promiseInstallationSetsProcessed = gotInstallationSets(
    qtFolders.map((qtInstallationSet) =>
      qtpath.findQtInstallations(qtInstallationSet)
    ),
    qtFolders
  );
  qtFolders.forEach((folder) => {
    const watcher = vscode.workspace.createFileSystemWatcher(folder);
    watcher.onDidChange(checkForQtInstallationsUpdates);
    watcher.onDidCreate(checkForQtInstallationsUpdates);
    watcher.onDidDelete(checkForQtInstallationsUpdates);
  });
  await promiseInstallationSetsProcessed;
}

// Register the 'vscode-qt-tools.registerQt' command
export function registerQtCommand(context: vscode.ExtensionContext) {
  RegisterQtCommandTitle = local.getCommandTitle(context, RegisterQtCommandId);
  context.subscriptions.push(
    vscode.commands.registerCommand(RegisterQtCommandId, registerQt)
  );
}
