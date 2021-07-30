import { IFavorites } from '@jlab-enhanced/favorites';
import { IRecents } from '@jlab-enhanced/recents';
import { ReactWidget } from '@jupyterlab/apputils';
import { BoxPanel } from '@lumino/widgets';
import { ITourManager } from 'jupyterlab-tour';

import * as React from 'react';


export class WelcomePage extends BoxPanel {
  constructor(
    favorites: IFavorites,
    recents: IRecents,
    tourManager: ITourManager
  ) {
    super({direction: "top-to-bottom"});

    this.addWidget(new RecentsWidget(recents));
  }
}

class RecentsWidget extends ReactWidget {
    constructor(private recents: IRecents){ super()}
    render() {
        return <ul> {this.recents.recents.map(item => <li> {item.path} </li>)} </ul>;
      }
}
