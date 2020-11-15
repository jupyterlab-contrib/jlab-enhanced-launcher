import { LabIcon } from '@jupyterlab/ui-components';

import viewListSvg from '../style/icons/view_list.svg';
import viewModuleSvg from '../style/icons/view_module.svg';

export const viewListIcon = new LabIcon({
  name: 'enhLauncher:list',
  svgstr: viewListSvg
});
export const viewModuleIcon = new LabIcon({
  name: 'enhLauncher:module',
  svgstr: viewModuleSvg
});
