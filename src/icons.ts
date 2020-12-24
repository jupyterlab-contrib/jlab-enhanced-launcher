import { LabIcon } from '@jupyterlab/ui-components';

import mostUsedSvg from '../style/icons/grade.svg';
import viewListSvg from '../style/icons/view_list.svg';
import viewModuleSvg from '../style/icons/view_module.svg';

export const mostUsedIcon = new LabIcon({
  name: 'enhLauncher:most-used',
  svgstr: mostUsedSvg
});
export const viewListIcon = new LabIcon({
  name: 'enhLauncher:list',
  svgstr: viewListSvg
});
export const viewModuleIcon = new LabIcon({
  name: 'enhLauncher:module',
  svgstr: viewModuleSvg
});
