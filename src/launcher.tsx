/* eslint-disable no-inner-declarations */
// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  showErrorMessage,
  VDomModel,
  VDomRenderer
} from '@jupyterlab/apputils';

import {
  nullTranslator,
  TranslationBundle,
  ITranslator
} from '@jupyterlab/translation';

import { PageConfig } from '@jupyterlab/coreutils';

import { ILauncher } from '@jupyterlab/launcher';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import { classes, folderIcon, LabIcon } from '@jupyterlab/ui-components';

import {
  ArrayExt,
  ArrayIterator,
  each,
  IIterator,
  map,
  toArray
} from '@lumino/algorithm';

import { CommandRegistry } from '@lumino/commands';

import { ReadonlyJSONObject } from '@lumino/coreutils';

import { DisposableDelegate, IDisposable } from '@lumino/disposable';

import { AttachedProperty } from '@lumino/properties';

import { Widget } from '@lumino/widgets';

import * as React from 'react';

import { mostUsedIcon, viewListIcon, viewModuleIcon } from './icons';

/**
 * Extension identifier
 */
export const EXTENSION_ID = '@jlab-enhanced/launcher:plugin';

/**
 * The class name added to Launcher instances.
 */
const LAUNCHER_CLASS = 'jp-NewLauncher';

/**
 * These launcher item categories are known to have kernels, so the kernel icons
 * are used.
 */
const KERNEL_CATEGORIES = ['Notebook', 'Console'];

/**
 * IUsageData records the count of usage and the most recent date of usage
 * for a certain kernel or card.
 */
export interface IUsageData {
  /**
   * Count the number that a certain card is used.
   */
  count: number;

  /**
   * The most recent timestamp a certain card is used.
   */
  mostRecent: number;
}

/**
 * LauncherModel keeps track of the path to working directory and has a list of
 * LauncherItems, which the Launcher will render.
 */
export class LauncherModel extends VDomModel implements ILauncher {
  constructor(settings?: ISettingRegistry.ISettings, state?: IStateDB) {
    super();
    this._settings = settings || null;
    this._state = state || null;

    this.dispose();
  }

  /**
   * Generate an unique identifier for a launcher item
   *
   * @param item Launcher item
   */
  static getItemUID(item: ILauncher.IItemOptions): string {
    return `${item.command}${JSON.stringify(item.args || {})}`;
  }

  /**
   * The known categories of launcher items and their default ordering.
   */
  get categories(): string[] {
    if (this._settings) {
      return this._settings.composite['categories'] as string[];
    } else {
      return ['Kernels', 'Other'];
    }
  }

  /**
   * The maximum number of cards showed in recent section
   */
  get nRecentCards(): number {
    if (this._settings) {
      return this._settings.composite['nRecentCards'] as number;
    } else {
      return 4;
    }
  }

  /**
   * Time (in milliseconds) after which the usage is considered to old
   */
  get maxUsageAge(): number {
    let age = 30;
    if (this._settings) {
      age = this._settings.composite['maxUsageAge'] as number;
    }
    return age * 24 * 3600 * 1000;
  }

  /**
   * Card usage data
   */
  get usage(): { [cardId: string]: IUsageData } {
    return this._usageData;
  }

  /**
   * Launcher view mode
   */
  get viewMode(): 'cards' | 'table' {
    return this._viewMode;
  }
  set viewMode(mode: 'cards' | 'table') {
    const hasChanged = this._viewMode !== mode;
    this._viewMode = mode;
    if (this._state && hasChanged) {
      this._state.save(`${EXTENSION_ID}:viewMode`, mode).catch(reason => {
        console.error('Fail to save view mode', reason);
      });
    }
  }

  /**
   * Add a command item to the launcher, and trigger re-render event for parent
   * widget.
   *
   * @param options - The specification options for a launcher item.
   *
   * @returns A disposable that will remove the item from Launcher, and trigger
   * re-render event for parent widget.
   *
   */
  add(options: ILauncher.IItemOptions): IDisposable {
    // Create a copy of the options to circumvent mutations to the original.
    const item = Private.createItem(options);

    this._items.push(item);
    this.stateChanged.emit(void 0);

    return new DisposableDelegate(() => {
      ArrayExt.removeFirstOf(this._items, item);
      this.stateChanged.emit(void 0);
    });
  }

  /**
   * Return an iterator of copied launcher items.
   */
  items(): IIterator<INewLauncher.IItemOptions> {
    return new ArrayIterator(
      this._items.map(item => {
        const key = LauncherModel.getItemUID(item);
        const usage = this._usageData[key] || { count: 0, mostRecent: 0 };
        return { ...item, ...usage };
      })
    );
  }

  /**
   * Handle card usage data when used.
   *
   * @param item Launcher item
   */
  useCard(item: ILauncher.IItemOptions): void {
    const id = LauncherModel.getItemUID(item);
    const usage = this._usageData[id];
    const now = Date.now();
    let currentCount = 0;
    if (usage && now - usage.mostRecent < this.maxUsageAge) {
      currentCount = usage.count;
    }
    this._usageData[id] = {
      count: currentCount + 1,
      mostRecent: now
    };
    if (this._state) {
      this._state
        .save(`${EXTENSION_ID}:usageData`, this._usageData as any)
        .catch((reason: Error) => {
          console.error(
            `Failed to save ${EXTENSION_ID}:usageData - ${reason.message}`,
            reason
          );
        });
    }
  }

  private _items: ILauncher.IItemOptions[] = [];
  private _settings: ISettingRegistry.ISettings | null = null;
  private _state: IStateDB | null = null;
  private _usageData: { [key: string]: IUsageData } = {};
  private _viewMode: 'cards' | 'table' = 'cards';
}

/**
 * A virtual-DOM-based widget for the Launcher.
 */
export class Launcher extends VDomRenderer<LauncherModel> {
  /**
   * Construct a new launcher widget.
   */
  constructor(options: INewLauncher.IOptions) {
    super(options.model);
    this._cwd = options.cwd;
    this.translator = options.translator || nullTranslator;
    this._trans = this.translator.load('jupyterlab');
    this._callback = options.callback;
    this._commands = options.commands;
    this.addClass(LAUNCHER_CLASS);
  }

  /**
   * The cwd of the launcher.
   */
  get cwd(): string {
    return this._cwd;
  }
  set cwd(value: string) {
    this._cwd = value;
    this.update();
  }

  /**
   * Whether there is a pending item being launched.
   */
  get pending(): boolean {
    return this._pending;
  }
  set pending(value: boolean) {
    this._pending = value;
  }

  /**
   * Render the launcher to virtual DOM nodes.
   */
  protected render(): React.ReactElement<any> | null {
    // Bail if there is no model.
    if (!this.model) {
      return null;
    }

    const mode = this.model.viewMode === 'cards' ? '' : '-Table';

    // First group-by categories
    const categories: {
      [category: string]: INewLauncher.IItemOptions[][];
    } = Object.create(null);
    each(this.model.items(), (item, index) => {
      const cat = item.category || 'Other';
      if (!(cat in categories)) {
        categories[cat] = [];
      }
      categories[cat].push([item]);
    });

    // Merge kernel items
    const notebooks = categories['Notebook'];
    if (notebooks) {
      delete categories['Notebook'];
    }
    const consoles = categories['Console'];
    if (consoles) {
      delete categories['Console'];
    }

    const kernels = notebooks;
    consoles.forEach(console_ => {
      const consoleName =
        (console_[0].args['kernelPreference'] &&
          (console_[0].args['kernelPreference'] as ReadonlyJSONObject)[
            'name'
          ]) ||
        '';
      const consoleLabel = this._commands.label(
        console_[0].command,
        console_[0].args
      );
      const kernel = kernels.find(kernel => {
        // kernel comes from notebook
        const kernelName = kernel[0].args['kernelName'] || '';
        const kernelLabel = this._commands.label(
          kernel[0].command,
          kernel[0].args
        );
        return kernelLabel === consoleLabel && kernelName === consoleName;
      });
      if (kernel) {
        kernel.push(console_[0]);
      } else {
        kernels.push(console_);
      }
    });
    categories['Kernels'] = kernels;

    // Within each category sort by rank
    for (const cat in categories) {
      categories[cat] = categories[cat].sort(
        (a: INewLauncher.IItemOptions[], b: INewLauncher.IItemOptions[]) => {
          return Private.sortCmp(a[0], b[0], this._cwd, this._commands);
        }
      );
    }

    // Variable to help create sections
    const sections: React.ReactElement<any>[] = [];

    // Assemble the final ordered list of categories, beginning with
    // model.categories.
    const orderedCategories: string[] = [];
    each(this.model.categories, (cat, index) => {
      if (cat in categories) {
        orderedCategories.push(cat);
      }
    });
    for (const cat in categories) {
      if (this.model.categories.indexOf(cat) === -1) {
        orderedCategories.push(cat);
      }
    }

    const mostUsedItems = toArray(this.model.items()).sort(
      (a: INewLauncher.IItemOptions, b: INewLauncher.IItemOptions) => {
        return Private.sortByUsage(
          a,
          b,
          this.model.maxUsageAge,
          this._cwd,
          this._commands
        );
      }
    );

    // Render the most used items
    if (this._searchInput === '') {
      const mostUsedSection = (
        <div className="jp-NewLauncher-section" key="most-used">
          <div className="jp-NewLauncher-sectionHeader">
            <mostUsedIcon.react stylesheet="launcherSection" />
            <h2 className="jp-NewLauncher-sectionTitle">
              {this._trans.__('Most Used')}
            </h2>
          </div>
          <div className={`jp-NewLauncher${mode}-cardContainer`}>
            {toArray(
              map(
                mostUsedItems.slice(0, this.model.nRecentCards),
                (item: INewLauncher.IItemOptions) => {
                  return Card(
                    KERNEL_CATEGORIES.indexOf(item.category || 'Other') > -1,
                    [item],
                    this,
                    this._commands,
                    this._trans,
                    this._callback
                  );
                }
              )
            )}
          </div>
        </div>
      );
      sections.push(mostUsedSection);
    }

    // Now create the sections for each category
    orderedCategories.forEach(cat => {
      if (categories[cat].length === 0) {
        return;
      }

      const item = categories[cat][0][0];
      const args = { ...item.args, cwd: this.cwd };
      const kernel = cat === 'Kernels';

      // DEPRECATED: remove _icon when lumino 2.0 is adopted
      // if icon is aliasing iconClass, don't use it
      const iconClass = this._commands.iconClass(item.command, args);
      const _icon = this._commands.icon(item.command, args);
      const icon = _icon === iconClass ? undefined : _icon;

      const section = (
        <div className="jp-NewLauncher-section" key={cat}>
          <div className="jp-NewLauncher-sectionHeader">
            <LabIcon.resolveReact
              icon={icon}
              iconClass={classes(iconClass, 'jp-Icon-cover')}
              stylesheet="launcherSection"
            />
            <h2 className="jp-NewLauncher-sectionTitle">
              {this._trans.__(cat)}
            </h2>
          </div>
          <div className={`jp-NewLauncher${mode}-cardContainer`}>
            {toArray(
              map(categories[cat], (items: INewLauncher.IItemOptions[]) => {
                const item = items[0];
                const command = item.command;
                const args = { ...item.args, cwd: this.cwd };
                const label = this._commands.label(command, args);

                // Apply search filter
                if (
                  label
                    .toLocaleLowerCase()
                    .indexOf(this._searchInput.toLocaleLowerCase()) === -1
                ) {
                  return null;
                }

                return Card(
                  kernel,
                  items,
                  this,
                  this._commands,
                  this._trans,
                  this._callback
                );
              })
            )}
          </div>
        </div>
      );
      sections.push(section);
    });

    // Wrap the sections in body and content divs.
    return (
      <div className="jp-NewLauncher-body">
        <div className="jp-NewLauncher-content">
          <div className="jp-NewLauncher-toolbar">
            <div className="jp-NewLauncher-search">
              <div className="jp-NewLauncher-search-wrapper">
                <input
                  className="jp-NewLauncher-search-input"
                  spellCheck={false}
                  placeholder="SEARCH"
                  onChange={(event): void => {
                    this._searchInput = event.target.value || '';
                    this.update();
                  }}
                />
              </div>
            </div>
            <div className="jp-NewLauncher-cwd">
              <folderIcon.react
                className="jp-NewLauncher-home"
                tag="span"
                title={
                  PageConfig.getOption('serverRoot') || 'Jupyter Server Root'
                }
                margin="0px 2px"
              />
              {/* Trailing / because with use direction rtl for better ellipsis rendering */}
              <h3 title={this.cwd}>{`${this.cwd}/`}</h3>
            </div>
            <div className="jp-NewLauncher-view">
              <button
                disabled={this.model.viewMode === 'cards'}
                onClick={(): void => {
                  this.model.viewMode = 'cards';
                  this.update();
                }}
              >
                <viewModuleIcon.react
                  tag="span"
                  title="Card view"
                  elementPosition="center"
                />
              </button>
              <button
                disabled={this.model.viewMode === 'table'}
                onClick={(): void => {
                  this.model.viewMode = 'table';
                  this.update();
                }}
              >
                <viewListIcon.react
                  tag="span"
                  title="Table view"
                  elementPosition="center"
                />
              </button>
            </div>
          </div>
          <div className="jp-NewLauncher-content-main">{sections}</div>
        </div>
      </div>
    );
  }

  protected translator: ITranslator;
  private _commands: CommandRegistry;
  private _callback: (widget: Widget) => void;
  private _cwd = '';
  private _pending = false;
  private _searchInput = '';
  private _trans: TranslationBundle;
}

/**
 * The namespace for `ILauncher` class statics.
 */
export namespace INewLauncher {
  /**
   * The options used to create a Launcher.
   */
  export interface IOptions {
    /**
     * The model of the launcher.
     */
    model: LauncherModel;

    /**
     * The cwd of the launcher.
     */
    cwd: string;

    /**
     * The command registry used by the launcher.
     */
    commands: CommandRegistry;

    /**
     * The application language translation.
     */
    translator?: ITranslator;

    /**
     * The callback used when an item is launched.
     */
    callback: (widget: Widget) => void;
  }

  export interface IItemOptions extends ILauncher.IItemOptions, IUsageData {}
}

/**
 * A pure tsx component for a launcher card.
 *
 * @param kernel - whether the item takes uses a kernel.
 *
 * @param item - the launcher item to render.
 *
 * @param launcher - the Launcher instance to which this is added.
 *
 * @param launcherCallback - a callback to call after an item has been launched.
 *
 * @returns a vdom `VirtualElement` for the launcher card.
 */
function Card(
  kernel: boolean,
  items: INewLauncher.IItemOptions[],
  launcher: Launcher,
  commands: CommandRegistry,
  trans: TranslationBundle,
  launcherCallback: (widget: Widget) => void
): React.ReactElement<any> {
  const mode = launcher.model.viewMode === 'cards' ? '' : '-Table';

  // Get some properties of the first command
  const item = items[0];
  const command = item.command;
  const args = { ...item.args, cwd: launcher.cwd };
  const caption = commands.caption(command, args);
  const label = commands.label(command, args);
  const title = kernel ? label : caption || label;

  // Build the onclick handler.
  const onClickFactory = (
    item: INewLauncher.IItemOptions
  ): ((event: any) => void) => {
    const onClick = (event: Event): void => {
      event.stopPropagation();
      // If an item has already been launched,
      // don't try to launch another.
      if (launcher.pending === true) {
        return;
      }
      launcher.pending = true;
      void commands
        .execute(item.command, {
          ...item.args,
          cwd: launcher.cwd
        })
        .then(value => {
          launcher.model.useCard(item);
          launcher.pending = false;
          if (value instanceof Widget) {
            launcherCallback(value);
            launcher.dispose();
          }
        })
        .catch(err => {
          launcher.pending = false;
          void showErrorMessage(trans._p('Error', 'Launcher Error'), err);
        });
    };

    return onClick;
  };
  const mainOnClick = onClickFactory(item);

  const getOptions = (items: INewLauncher.IItemOptions[]): JSX.Element[] => {
    return items.map(item => {
      let label = 'Open';
      if (
        item.category &&
        (items.length > 1 || KERNEL_CATEGORIES.indexOf(item.category) > -1)
      ) {
        label = item.category;
      }
      return (
        <div
          className="jp-NewLauncher-option-button"
          key={label.toLowerCase()}
          onClick={onClickFactory(item)}
        >
          <span className="jp-NewLauncher-option-button-text">
            {label.toUpperCase()}
          </span>
        </div>
      );
    });
  };

  // With tabindex working, you can now pick a kernel by tabbing around and
  // pressing Enter.
  const onkeypress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      mainOnClick(event);
    }
  };

  // DEPRECATED: remove _icon when lumino 2.0 is adopted
  // if icon is aliasing iconClass, don't use it
  const iconClass = commands.iconClass(command, args);
  const _icon = commands.icon(command, args);
  const icon = _icon === iconClass ? undefined : _icon;

  // Return the VDOM element.
  return (
    <div
      className={`jp-NewLauncher-item${mode}`}
      title={title}
      onClick={mainOnClick}
      onKeyPress={onkeypress}
      tabIndex={100}
      data-category={item.category || 'Other'}
      key={Private.keyProperty.get(item)}
    >
      <div className={`jp-NewLauncherCard-icon jp-NewLauncher${mode}-Cell`}>
        {kernel ? (
          item.kernelIconUrl ? (
            <img
              src={item.kernelIconUrl}
              className="jp-NewLauncher-kernelIcon"
            />
          ) : (
            <div className="jp-NewLauncherCard-noKernelIcon">
              {label[0].toUpperCase()}
            </div>
          )
        ) : (
          <LabIcon.resolveReact
            icon={icon}
            iconClass={classes(iconClass, 'jp-Icon-cover')}
            stylesheet="launcherCard"
          />
        )}
      </div>
      <div
        className={`jp-NewLauncher-label jp-NewLauncher${mode}-Cell`}
        title={label}
      >
        {label}
      </div>
      <div
        className={`jp-NewLauncher-options-wrapper jp-NewLauncher${mode}-Cell`}
      >
        <div className="jp-NewLauncher-options">{getOptions(items)}</div>
      </div>
    </div>
  );
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * An incrementing counter for keys.
   */
  let id = 0;

  /**
   * An attached property for an item's key.
   */
  export const keyProperty = new AttachedProperty<
    INewLauncher.IItemOptions,
    number
  >({
    name: 'key',
    create: (): number => id++
  });

  /**
   * Create a fully specified item given item options.
   */
  export function createItem(
    options: ILauncher.IItemOptions
  ): ILauncher.IItemOptions {
    return {
      ...options,
      category: options.category || '',
      rank: options.rank !== undefined ? options.rank : Infinity
    };
  }

  /**
   * A sort comparison function for a launcher item.
   */
  export function sortCmp(
    a: INewLauncher.IItemOptions,
    b: INewLauncher.IItemOptions,
    cwd: string,
    commands: CommandRegistry
  ): number {
    // First, compare by rank.
    const r1 = a.rank;
    const r2 = b.rank;
    if (r1 !== r2 && r1 !== undefined && r2 !== undefined) {
      return r1 < r2 ? -1 : 1; // Infinity safe
    }

    // Finally, compare by display name.
    const aLabel = commands.label(a.command, { ...a.args, cwd });
    const bLabel = commands.label(b.command, { ...b.args, cwd });
    return aLabel.localeCompare(bLabel);
  }

  export function sortByUsage(
    a: INewLauncher.IItemOptions,
    b: INewLauncher.IItemOptions,
    maxUsageAge: number,
    cwd: string,
    commands: CommandRegistry
  ): number {
    const now = Date.now();

    const aCount = now - a.mostRecent < maxUsageAge ? a.count : 0;
    const bCount = now - b.mostRecent < maxUsageAge ? b.count : 0;
    if (aCount === bCount) {
      const mostRecent = b.mostRecent - a.mostRecent;
      return mostRecent === 0 ? sortCmp(a, b, cwd, commands) : mostRecent;
    }
    return bCount - aCount;
  }
}
