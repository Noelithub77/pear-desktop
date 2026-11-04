import { t } from '@/i18n';
import { createPlugin } from '@/utils';

const browseEndpoints = new Map<string, object>([
  ['h', { browseId: 'FEmusic_history' }],
  // `ZZ` is the charts page's "Global" option. Without it the page opens on the user's own country.
  ['g', { browseId: 'FEmusic_charts', formData: { selectedValues: ['ZZ'] } }],
  ['escape', { browseId: 'FEmusic_home' }],
]);

const onKeyDown = (event: KeyboardEvent) => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const browseEndpoint = browseEndpoints.get(event.key.toLowerCase());
  if (!browseEndpoint) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;

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
    stop() {
      window.removeEventListener('keydown', onKeyDown, true);
    },
  },
});
