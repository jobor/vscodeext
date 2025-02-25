// Copyright (C) 2023 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as vscode from 'vscode';

import * as qtpath from '../util/get-qt-paths';
import * as local from '../util/localize';
import * as util from '../util/util';
import * as fs from 'fs';
import * as path from 'path';
import { stateManager } from '../state';
import { updateCMakeKitsJson } from './detect-qt-cmake';
import { Home, IsLinux, IsMacOS, IsWindows } from '../util/os';

export const RegisterQtCommandId = 'vscode-qt-tools.registerQt';
let RegisterQtCommandTitle = '';

export function getRegisterQtCommandTitle(): string {
  return RegisterQtCommandTitle;
}

const QtFolderConfig = 'qtFolder';

async function updateQtInstallations(qtInstallation: string[]) {
  await stateManager.setQtInstallations(qtInstallation);
  await updateCMakeKitsJson(qtInstallation);
}

async function saveSelectedQt(folderPath: string) {
  const qtInstallation = await qtpath.findQtInstallations(folderPath);
  if (folderPath) {
    if (qtInstallation.length === 0) {
      void vscode.window.showInformationMessage(`No Qt version found.`);
      console.log('No Qt version found.');
    } else {
      void vscode.window.showInformationMessage(
        `Found ${qtInstallation.length} Qt installation(s).`
      );
      console.log(`Found ${qtInstallation.length} Qt installation(s).`);
    }
  }
  await updateQtInstallations(qtInstallation);
}

export async function registerQt() {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: 'Select The Qt installation path',
    canSelectFiles: false,
    canSelectFolders: true
  };
  const selectedQtFolderUri = await vscode.window.showOpenDialog(options);
  if (!selectedQtFolderUri) {
    void vscode.window.showInformationMessage(
      'No Qt installation path selected.'
    );
    return;
  }
  const selectedQtFolder = selectedQtFolderUri[0].fsPath;
  if (selectedQtFolder) {
    void setQtFolder(selectedQtFolder);
  }
  return 0;
}

export async function checkForQtInstallations() {
  const qtFolder = getQtFolder();
  if (!qtFolder) {
    return;
  }
  const oldQtInstallations = stateManager.getQtInstallations();
  const newQtInstallations = await qtpath.findQtInstallations(qtFolder);
  if (
    newQtInstallations.length !== oldQtInstallations.length ||
    !newQtInstallations.every((v, i) => v === oldQtInstallations[i])
  ) {
    await updateQtInstallations(newQtInstallations);
  }
}

export function getQtFolder(): string {
  return (
    vscode.workspace
      .getConfiguration('vscode-qt-tools')
      .get<string>(QtFolderConfig) ?? ''
  );
}

export function checkDefaultQtFolderPath() {
  if (!stateManager.getAskForDefaultQtFolder()) {
    return;
  }

  if (getQtFolder()) {
    // Qt folder is already set. No need to check for default path
    return;
  }
  let defaultPath = '';
  if (IsLinux || IsMacOS) {
    defaultPath = path.join(Home, 'Qt');
  } else if (IsWindows) {
    defaultPath = path.join('C:', 'Qt');
  } else {
    throw new Error('Unsupported OS');
  }

  const defaultPathExists = fs.existsSync(defaultPath);
  if (!defaultPathExists) {
    return;
  }

  const setDefaultPathButtonMessage = 'Set Qt folder';
  const doNotShowAgainButtonMessage = 'Do not show again';
  void vscode.window
    .showInformationMessage(
      `Qt folder was found at "${defaultPath}". Do you want to use it?`,
      setDefaultPathButtonMessage,
      doNotShowAgainButtonMessage
    )
    .then((response) => {
      if (response === setDefaultPathButtonMessage) {
        void setQtFolder(defaultPath);
      } else if (response === doNotShowAgainButtonMessage) {
        void stateManager.setAskForDefaultQtFolder(false);
      }
    });
}

export async function setQtFolder(qtFolder: string) {
  const config = vscode.workspace.getConfiguration('vscode-qt-tools');
  const configTarget = util.isTestMode()
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await config.update(QtFolderConfig, qtFolder, configTarget);
}

export function registerQtCommand(context: vscode.ExtensionContext) {
  RegisterQtCommandTitle = local.getCommandTitle(context, RegisterQtCommandId);
  context.subscriptions.push(
    vscode.commands.registerCommand(RegisterQtCommandId, registerQt)
  );
}

export function onQtFolderUpdated() {
  const qtFolder = getQtFolder();
  if (qtFolder) {
    if (!fs.existsSync(qtFolder)) {
      void vscode.window.showInformationMessage(
        `The specified Qt installation path does not exist.`
      );
    }
  }
  void saveSelectedQt(qtFolder);
}

export async function getSelectedQtInstallationPath(): Promise<string> {
  const selectedCMakeKit =
    await vscode.commands.executeCommand<string>('cmake.buildKit');
  if (!selectedCMakeKit || selectedCMakeKit === '__unspec__') {
    // show information message to the user
    void vscode.window
      .showInformationMessage(
        'No CMake kit selected. Please select a CMake kit.',
        ...['Select CMake Kit']
      )
      .then((selection) => {
        if (selection === 'Select CMake Kit') {
          void vscode.commands.executeCommand('cmake.selectKit');
        }
      });
    throw new Error('No CMake kit selected');
  }
  const splittedKit = selectedCMakeKit.split('-');
  if (splittedKit.length < 3) {
    throw new Error('Unable to parse selected CMake kit');
  }
  const qtFolder = getQtFolder();
  if (!qtFolder) {
    throw new Error('No Qt installation path selected');
  }
  const version = splittedKit[1];
  const kitType = splittedKit[2];
  const selectedQtKitPath = path.join(qtFolder, version, kitType);
  if (!fs.existsSync(selectedQtKitPath)) {
    throw new Error('Selected Qt installation path does not exist');
  }

  return selectedQtKitPath;
}
