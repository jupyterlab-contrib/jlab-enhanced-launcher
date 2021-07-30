import { IFavorites } from '@jlab-enhanced/favorites';
import { IRecents } from '@jlab-enhanced/recents';
import { ReactWidget } from '@jupyterlab/apputils';
import { BoxPanel } from '@lumino/widgets';
import { CommandRegistry } from '@lumino/commands';
import { ITourManager } from 'jupyterlab-tour';

import * as React from 'react';


export class WelcomePage extends BoxPanel {
  constructor(
    favorites: IFavorites,
    recents: IRecents,
    tourManager: ITourManager,
    commands: CommandRegistry
  ) {
    super({direction: "top-to-bottom"});

    this.addWidget(new RecentsWidget(recents, commands));
  }
}

class RecentsWidget extends ReactWidget {
    constructor(private recents: IRecents, private commands: CommandRegistry){ super()}
    render() {
        return <ul> {this.recents.recents.map(item => <li><a onClick={() => { this.commands.execute('filebrowser:open-path', {path: item.path === '' ? '/' : item.path})}} > {item.path}</a> </li>)} </ul>;
      }
}
