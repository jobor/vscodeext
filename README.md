# Qt for Visual Studio Code

This extension provides support for developing Qt projects with Visual
Studio Code.

## Features

- Detects the Qt installations provided by Qt's online installer.
- Creates CMake kits for each Qt installation.
- Provides debugging support for Qt's C++ types.
- Provides support for various Qt-specific file formats.

## Getting started

After installing the extension, point it your Qt installation folder
by calling the _Qt: Register Qt Installation_ command. This will
create CMake kits for each Qt version.

Now, open a Qt CMake project and select one of the newly created kits
with the command _CMake: Select a Kit_.

## Options

### qtFolder

Specifies the folder of the Qt installation. Use the _Register Qt
Installation_ command to set it conveniently.

## Commands

### Register Qt Installation

Lets you select the folder where Qt has been installed using the Qt
installer.

### Open UI File in Qt Designer

Opens the currently selected .ui file in Qt Designer.

## License

This extension can be licensed under the Qt Commercial License and the
LGPL 3.0. See the text of both licenses [here](LICENSE).
