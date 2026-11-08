import { t } from '@/i18n';
import { createPlugin } from '@/utils';

import style from './style.css?inline';
import { type TabSpec, type Tabs, startTabs } from './tabs';

const tabKeys = ['escape', 'h', 'g'];

const tabSpecs = (): TabSpec[] => [
  {
    label: t('plugins.keyboard-navigation.tabs.home'),
    shortcut: 'Alt+Esc',
    path: '/',
    endpoint: { browseId: 'FEmusic_home' },
  },
  {
    label: t('plugins.keyboard-navigation.tabs.history'),
    shortcut: 'Alt+H',
    path: '/history',
    endpoint: { browseId: 'FEmusic_history' },
  },
  {
    label: t('plugins.keyboard-navigation.tabs.charts'),
    shortcut: 'Alt+G',
    path: '/charts',
    // `ZZ` is the charts page's "Global" option. Without it the page opens on the user's own country.
    endpoint: {
      browseId: 'FEmusic_charts',
      formData: { selectedValues: ['ZZ'] },
    },
  },
];

let tabs: Tabs | null = null;

const onKeyDown = (event: KeyboardEvent) => {
  if (!tabs || event.metaKey) return;

  if (event.ctrlKey && !event.altKey && event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    tabs.cycle(event.shiftKey ? -1 : 1);
    return;
  }

  if (!event.altKey || event.ctrlKey || event.shiftKey) return;
  const index = tabKeys.indexOf(event.key.toLowerCase());
  if (index === -1) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) tabs.show(index);
};

export default createPlugin({
  name: () => t('plugins.keyboard-navigation.name'),
  description: () => t('plugins.keyboard-navigation.description'),
  restartNeeded: false,
  config: {
    enabled: true,
  },
  stylesheets: [style],
  renderer: {
    start() {
      window.addEventListener('keydown', onKeyDown, true);
    },
    // The tabs fetch through the site's request client, which is ready by now.
    onPlayerApiReady() {
      tabs?.stop();
      tabs = startTabs(tabSpecs());
    },
    stop() {
      window.removeEventListener('keydown', onKeyDown, true);
      tabs?.stop();
      tabs = null;
    },
  },
});
