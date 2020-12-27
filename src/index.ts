// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';

import { ILauncher } from '@jupyterlab/launcher';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import { ITranslator } from '@jupyterlab/translation';

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
  requires: [ITranslator],
  optional: [ILabShell, ICommandPalette, ISettingRegistry, IStateDB],
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
async function activate(
  app: JupyterFrontEnd,
  translator: ITranslator,
  labShell: ILabShell | null,
  palette: ICommandPalette | null,
  settingRegistry: ISettingRegistry | null,
  state: IStateDB | null
): Promise<ILauncher> {
  const { commands, shell } = app;
  const trans = translator.load('jupyterlab');

  let settings: ISettingRegistry.ISettings | null = null;
  if (settingRegistry) {
    try {
      settings = await settingRegistry.load(EXTENSION_ID);
    } catch (reason) {
      console.log(`Failed to load settings for ${EXTENSION_ID}.`, reason);
    }
  }

  const model = new LauncherModel(settings, state);

  if (state) {
    Promise.all([
      state.fetch(`${EXTENSION_ID}:usageData`),
      state.fetch(`${EXTENSION_ID}:viewMode`),
      app.restored
    ])
      .then(([usage, mode]) => {
        model.viewMode = (mode as any) || 'cards';
        for (const key in usage as any) {
          model.usage[key] = (usage as any)[key];
        }
      })
      .catch(reason => {
        console.error('Fail to restore launcher usage data', reason);
      });
  }

  commands.addCommand(CommandIDs.create, {
    label: trans.__('New Launcher'),
    execute: (args: ReadonlyPartialJSONObject) => {
      const cwd = args['cwd'] ? String(args['cwd']) : '';
      const id = `launcher-${Private.id++}`;
      const callback = (item: Widget): void => {
        shell.add(item, 'main', { ref: id });
      };
      const launcher = new Launcher({ model, cwd, callback, commands });

      launcher.model = model;
      launcher.title.icon = launcherIcon;
      launcher.title.label = trans.__('Launcher');

      const main = new MainAreaWidget({ content: launcher });

      // If there are any other widgets open, remove the launcher close icon.
      main.title.closable = !!toArray(shell.widgets('main')).length;
      main.id = id;

      shell.add(main, 'main', { activate: args['activate'] as boolean });

      if (labShell) {
        labShell.layoutModified.connect(() => {
          // If there is only a launcher open, remove the close icon.
          main.title.closable = toArray(labShell.widgets('main')).length > 1;
        }, main);
      }

      return main;
    }
  });

  if (palette) {
    palette.addItem({
      command: CommandIDs.create,
      category: trans.__('Launcher')
    });
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
