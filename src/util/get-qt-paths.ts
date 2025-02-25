// Copyright (C) 2023 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as child_process from 'child_process';
import * as fs from 'fs/promises';
import { Home, IsMacOS, IsWindows } from './os';
import * as path from 'path';
import * as fsutil from './fs';
import * as vscode from 'vscode';

export const PlatformExecutableExtension = IsWindows ? '.exe' : '';
export const QmakeFileName = 'qmake' + PlatformExecutableExtension;
export const DesignerExeName = IsMacOS
  ? 'Designer'
  : 'designer' + PlatformExecutableExtension;
export const QtToolchainCMakeFileName = 'qt.toolchain.cmake';
export const NinjaFileName = 'ninja' + PlatformExecutableExtension;
export const UserLocalDir = IsWindows
  ? process.env.LOCALAPPDATA ?? ''
  : path.join(Home, '.local/share');

export function matchesVersionPattern(path: string): boolean {
  // Check if the first character of the path is a digit (0-9)
  return /^([0-9]+\.)+/.test(path);
}

// Function to recursively search a directory for Qt installations
export async function findQtInstallations(dir: string): Promise<string[]> {
  if (!dir || !(await fsutil.exists(dir))) {
    return [];
  }
  const qtInstallations: string[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && matchesVersionPattern(item.name)) {
      const installationItemPath = path.join(dir, item.name);
      const installationItemDirContent = await fs.readdir(
        installationItemPath,
        { withFileTypes: true }
      );
      for (const subitem of installationItemDirContent) {
        if (subitem.isDirectory() && subitem.name.toLowerCase() != 'src') {
          const subdirFullPath = path.join(installationItemPath, subitem.name);
          const qtConfPath = path.join(subdirFullPath, 'bin', 'qt.conf');
          try {
            await fs.access(qtConfPath).then(() => {
              qtInstallations.push(subdirFullPath);
            });
          } catch (err) {
            console.log(err);
          }
        }
      }
    }
  }
  return qtInstallations;
}

export async function findFilesInDir(
  startPath: string,
  filterExtension: string
): Promise<string[]> {
  const stat = await fs.stat(startPath);
  if (!stat.isDirectory()) {
    console.log('No directory:', startPath);
    return [];
  }

  const results: string[] = [];

  async function walkDir(currentPath: string): Promise<void> {
    const files = await fs.readdir(currentPath, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        await walkDir(file.path);
      } else if (path.extname(file.path) === filterExtension) {
        results.push(file.path);
      }
    }
  }

  await walkDir(startPath);
  return results;
}

export async function pathOfDirectoryIfExists(
  dirPath: string
): Promise<string | undefined> {
  try {
    await fs.access(dirPath);
    return path.normalize(dirPath);
  } catch (error) {
    return undefined;
  }
}

export function qtToolsDirByQtRootDir(qtRootDir: string): string {
  return path.normalize(path.join(qtRootDir, 'Tools'));
}

export function qtToolsDirByQtInstallationDir(qtInstallation: string): string {
  return qtToolsDirByQtRootDir(qtRootByQtInstallation(qtInstallation));
}

export async function findFilesInWorkspace(
  filterExtension: string
): Promise<string[]> {
  // Get list of all the files in the workspace folders recursively
  let files: string[] = [];
  // Create an array to hold the promises
  const promises = [];
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    // Define the search pattern
    const pattern = new vscode.RelativePattern(
      workspaceFolder,
      filterExtension
    );

    // Use findFiles to search for .pro files
    promises.push(
      vscode.workspace.findFiles(pattern, null).then((matches) => {
        files = files.concat(
          matches.map((uri) => {
            return uri.path;
          })
        );
      })
    );
  }
  await Promise.all(promises);
  return files;
}

export function mangleQtInstallation(installation: string): string {
  const pathParts = installation.split(/[/\\:]+/).filter((n) => n);
  const qtIdx = Math.max(
    0,
    pathParts.findIndex((s) => s.toLowerCase() == 'qt')
  );
  return pathParts.slice(qtIdx).join('-');
}

export async function locateQmakeExeFilePath(selectedQtPath: string) {
  const bin = path.join(selectedQtPath, 'bin');
  const qmakeExePath = path.join(bin, QmakeFileName);
  return (
    (await fsutil.existing(qmakeExePath)) ||
    (await fsutil.existing(QmakeFileName)) ||
    (await fsutil.existing(path.join(bin, 'qmake'))) ||
    (await fsutil.existing('qmake'))
  );
}

export async function locateNinjaExecutable(qtRootDir: string) {
  const ninjaDirPath = path.join(qtToolsDirByQtRootDir(qtRootDir), 'Ninja');
  const ninjaExePath = path.join(ninjaDirPath, NinjaFileName);
  try {
    await fs.access(ninjaExePath);
    return ninjaExePath;
  } catch (err) {
    // Do nothing
  }

  const vs2022dir = process.env.VS2022INSTALLDIR;
  if (vs2022dir) {
    const vsNinjaExecutable = path.join(
      vs2022dir,
      'Common7',
      'IDE',
      'CommonExtensions',
      'Microsoft',
      'CMake',
      'Ninja',
      NinjaFileName
    );
    try {
      await fs.access(vsNinjaExecutable);
      return vsNinjaExecutable;
    } catch (err) {
      // Do nothing
    }

    const visualStudioAndroidNinjaExecutable = path.join(
      vs2022dir,
      'MSBuild',
      'Google',
      'Android',
      'bin',
      NinjaFileName
    );
    try {
      await fs.access(visualStudioAndroidNinjaExecutable);
      return visualStudioAndroidNinjaExecutable;
    } catch (err) {
      // Do nothing
    }
  }

  return ninjaExePath;
}

export async function locateMingwBinDirPath(qtRootDir: string) {
  // TODO: check if g++ exists in PATH already
  const qtToolsDir = qtToolsDirByQtRootDir(qtRootDir);
  const items = await fs.readdir(qtToolsDir, { withFileTypes: true });
  const mingws = items.filter((item) =>
    item.name.toLowerCase().startsWith('mingw')
  );
  const promiseMingwsWithBinDirs = mingws.map((item) =>
    pathOfDirectoryIfExists(path.join(qtToolsDir, item.name, 'bin'))
  );
  const mingwsWithBins = (await Promise.all(promiseMingwsWithBinDirs)).filter(
    Boolean
  ) as string[];
  const mingwVersions = new Map<number, string>(
    mingwsWithBins.map((item) => {
      const m = item.match(/mingw(\d+)_\d+/);
      let v = 0;
      if (m) v = parseInt(m[1], 10);
      return [v, item];
    })
  );

  const highestMingWVersion = Math.max(...mingwVersions.keys());
  return mingwVersions.get(highestMingWVersion);
}

export async function locateCMakeQtToolchainFile(installation: string) {
  const libCMakePath = path.join(installation, 'lib', 'cmake');
  let cmakeQtToolchainFilePath = path.join(
    libCMakePath,
    'Qt6',
    QtToolchainCMakeFileName
  );
  try {
    await fs.access(cmakeQtToolchainFilePath);
    return cmakeQtToolchainFilePath;
  } catch (err) {
    // Do nothing
  }
  cmakeQtToolchainFilePath = path.join(
    libCMakePath,
    'Qt5',
    QtToolchainCMakeFileName
  );
  try {
    await fs.access(cmakeQtToolchainFilePath);
    return cmakeQtToolchainFilePath;
  } catch (err) {
    // Do nothing
  }
  cmakeQtToolchainFilePath = path.join(
    libCMakePath,
    'Qt',
    QtToolchainCMakeFileName
  );
  try {
    await fs.access(cmakeQtToolchainFilePath);
    return cmakeQtToolchainFilePath;
  } catch (err) {
    // Do nothing
  }
  return '';
}

export function qtRootByQtInstallation(installation: string) {
  return path.normalize(path.join(installation, '..', '..'));
}

export function envPathForQtInstallationWithNinja(
  installation: string,
  ninjaExePath: string
) {
  const qtRootDir = qtRootByQtInstallation(installation);
  const cmakeDirPath = locateCMakeExecutableDirectoryPath(qtRootDir);
  const ninjaDirPath = path.dirname(ninjaExePath);
  const installationBinDir = path.join(installation, 'bin');
  const QtPathAddition = [
    installation,
    installationBinDir,
    '${env:PATH}',
    ninjaDirPath,
    cmakeDirPath
  ].join(path.delimiter);
  return QtPathAddition;
}

export async function locateJomExecutable(qtRootDir: string) {
  const qtToolsDir = qtToolsDirByQtRootDir(qtRootDir);
  const jomDirPath = path.join(qtToolsDir, 'QtCreator', 'bin', 'jom');
  const jomFileName = 'jom' + PlatformExecutableExtension;
  const jomExePath = path.join(jomDirPath, jomFileName);
  try {
    await fs.access(jomExePath);
    return jomExePath;
  } catch (err) {
    // Do nothing
  }
  try {
    await fs.access(jomExePath);
    return jomExePath;
  } catch (err) {
    return '';
  }
}

export async function envPathForQtInstallation(installation: string) {
  const qtRootDir = qtRootByQtInstallation(installation);
  const promiseNinjaPath = locateNinjaExecutable(qtRootDir);
  const promiseJomPath = locateJomExecutable(qtRootDir);
  const isMingwInstallation = path.basename(installation).startsWith('mingw');
  const promiseMingwPath = isMingwInstallation
    ? locateMingwBinDirPath(qtRootDir)
    : undefined;
  let qtPathEnv = envPathForQtInstallationWithNinja(
    installation,
    await promiseNinjaPath
  );
  const jomExePath = await promiseJomPath;
  if (jomExePath) {
    qtPathEnv = `${jomExePath}${path.delimiter}${qtPathEnv}`;
  }
  if (isMingwInstallation) {
    const mingwPath = (await promiseMingwPath) ?? '';
    qtPathEnv = `${mingwPath}${path.delimiter}${qtPathEnv}`;
  }
  return qtPathEnv;
}

export function locateCMakeExecutableDirectoryPath(qtRootDir: string) {
  // TODO: check if cmake exists in PATH already
  return path.join(qtToolsDirByQtRootDir(qtRootDir), 'CMake_64', 'bin');
}

export async function queryHostBinDirPath(
  selectedQtPath: string
): Promise<string> {
  const qmakeExePath = await locateQmakeExeFilePath(selectedQtPath);
  const childProcess = child_process.exec(
    qmakeExePath + ' -query QT_HOST_BINS'
  );
  const promiseFirstLineOfOutput = new Promise<string>((resolve, reject) => {
    childProcess.stdout?.on('data', (data: string) => {
      resolve(data.toString().trim());
    });
    childProcess.stderr?.on('data', (data: string) => {
      reject(new Error(data.toString().trim()));
    });
  });
  const promiseProcessClose = new Promise<string>((resolve, reject) => {
    childProcess.on('close', () => {
      resolve('');
    });
    childProcess.on('error', (err) => {
      reject(err);
    });
  });
  const hostBinDir = await Promise.race([
    promiseFirstLineOfOutput,
    promiseProcessClose
  ]);
  return hostBinDir;
}

export async function locateQtDesignerExePath(selectedQtPath: string) {
  let designerExePath = IsMacOS
    ? path.join(
        selectedQtPath,
        'bin',
        'Designer.app',
        'Contents',
        'MacOS',
        DesignerExeName
      )
    : path.join(selectedQtPath, 'bin', DesignerExeName);
  try {
    await fs.access(designerExePath);
    return designerExePath;
  } catch (err) {
    // Do nothing
  }

  const hostBinDir = await queryHostBinDirPath(selectedQtPath);
  designerExePath = path.join(hostBinDir, DesignerExeName);
  try {
    await fs.access(designerExePath);
    return designerExePath;
  } catch (err) {
    // Do nothing
  }

  if (!IsWindows) {
    designerExePath = '/usr/bin/designer';
    try {
      await fs.access(designerExePath);
      return designerExePath;
    } catch (err) {
      // Do nothing
    }
  }

  return DesignerExeName;
}
