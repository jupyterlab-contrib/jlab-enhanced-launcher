// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';

import { IStateDB } from '@jupyterlab/statedb';

import { launcherIcon } from '@jupyterlab/ui-components';

import { toArray } from '@lumino/algorithm';

import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { Widget } from '@lumino/widgets';

import { EXTENSION_ID, Launcher, LauncherModel } from './launcher';

/**
 * The command IDs used by the launcher plugin.
 */
namespace CommandIDs {
  export const create = 'launcher:create';
}

/**
 * A service providing an interface to the the launcher.
 */
const plugin: JupyterFrontEndPlugin<ILauncher> = {
  activate,
  id: EXTENSION_ID,
  requires: [ILabShell],
  optional: [ICommandPalette, IStateDB],
  provides: ILauncher,
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * Activate the launcher.
 */
function activate(
  app: JupyterFrontEnd,
  labShell: ILabShell,
  palette: ICommandPalette | null,
  state: IStateDB | null
): ILauncher {
  const { commands } = app;

  const model = new LauncherModel(state);

  if (state) {
    Promise.all([state.fetch(`${EXTENSION_ID}:usage-data`), app.restored]).then(
      ([usage]) => {
        for (const key in usage as any) {
          model.usage[key] = (usage as any)[key];
        }
      }
    );
  }

  commands.addCommand(CommandIDs.create, {
    label: 'New Launcher',
    execute: (args: ReadonlyPartialJSONObject) => {
      const cwd = args['cwd'] ? String(args['cwd']) : '';
      const id = `launcher-${Private.id++}`;
      const callback = (item: Widget): void => {
        labShell.add(item, 'main', { ref: id });
      };
      const launcher = new Launcher({ model, cwd, callback, commands });

      launcher.model = model;
      launcher.title.icon = launcherIcon;
      launcher.title.label = 'Launcher';

      const main = new MainAreaWidget({ content: launcher });

      // If there are any other widgets open, remove the launcher close icon.
      main.title.closable = !!toArray(labShell.widgets('main')).length;
      main.id = id;

      labShell.add(main, 'main', { activate: args['activate'] as boolean });

      labShell.layoutModified.connect(() => {
        // If there is only a launcher open, remove the close icon.
        main.title.closable = toArray(labShell.widgets('main')).length > 1;
      }, main);

      return main;
    }
  });

  if (palette) {
    palette.addItem({ command: CommandIDs.create, category: 'Launcher' });
  }

  return model;
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The incrementing id used for launcher widgets.
   */
  // eslint-disable-next-line prefer-const
  export let id = 0;
}
