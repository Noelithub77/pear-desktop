import { t } from '@/i18n';
import { createPlugin } from '@/utils';

import {
  type BrowseEndpoint,
  type PageCache,
  startPageCache,
} from './page-cache';

const browseEndpoints = new Map<string, BrowseEndpoint>([
  ['h', { browseId: 'FEmusic_history' }],
  // `ZZ` is the charts page's "Global" option. Without it the page opens on the user's own country.
  ['g', { browseId: 'FEmusic_charts', formData: { selectedValues: ['ZZ'] } }],
  ['escape', { browseId: 'FEmusic_home' }],
]);

let pageCache: PageCache | null = null;

const onKeyDown = (event: KeyboardEvent) => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const browseEndpoint = browseEndpoints.get(event.key.toLowerCase());
  if (!browseEndpoint) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;

  pageCache?.claim(browseEndpoint);
  // The site's own router, so playback continues across the page change.
  document.querySelector('ytmusic-app')?.dispatchEvent(
    new CustomEvent('yt-navigate', {
      bubbles: true,
      composed: true,
      detail: { endpoint: { browseEndpoint } },
    }),
  );
};

export default createPlugin({
  name: () => t('plugins.keyboard-navigation.name'),
  description: () => t('plugins.keyboard-navigation.description'),
  restartNeeded: false,
  config: {
    enabled: true,
  },
  renderer: {
    start() {
      window.addEventListener('keydown', onKeyDown, true);
    },
    // Prefetching needs the site's request client, which is ready by now.
    onPlayerApiReady() {
      pageCache?.stop();
      pageCache = startPageCache([...browseEndpoints.values()]);
    },
    stop() {
      window.removeEventListener('keydown', onKeyDown, true);
      pageCache?.stop();
      pageCache = null;
    },
  },
});
