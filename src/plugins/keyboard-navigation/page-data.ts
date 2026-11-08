import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

export type BrowseEndpoint = {
  browseId: string;
  formData?: { selectedValues: string[] };
};

const refreshAfterMs = 10 * 60 * 1000;
// Gives the server a moment to add the new play before history is fetched again.
const historyRefreshDelayMs = 3000;

// Fetches each page's data, and fetches it again whenever it goes stale.
export const watchPageData = (
  endpoints: BrowseEndpoint[],
  onData: (endpoint: BrowseEndpoint, data: unknown) => void,
) => {
  const fetchedAt = new Map<BrowseEndpoint, number>();
  const inFlight = new Set<BrowseEndpoint>();
  // History gains an entry with every recorded play, so older copies are stale.
  let lastPlayAt = 0;
  let historyTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const isStale = (endpoint: BrowseEndpoint) => {
    const at = fetchedAt.get(endpoint);
    return (
      at === undefined ||
      Date.now() - at > refreshAfterMs ||
      (endpoint.browseId === 'FEmusic_history' && at <= lastPlayAt)
    );
  };

  const refresh = async (endpoint: BrowseEndpoint) => {
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
    if (!app || inFlight.has(endpoint)) return;
    inFlight.add(endpoint);
    const startedAt = Date.now();
    try {
      const data = await app.networkManager.fetch<unknown, BrowseEndpoint>(
        '/browse',
        endpoint,
      );
      if (stopped) return;
      fetchedAt.set(endpoint, startedAt);
      onData(endpoint, data);
    } catch {
      // Tried again on the next check.
    } finally {
      inFlight.delete(endpoint);
    }
  };

  const refreshStale = () => {
    if (document.hidden) return;
    for (const endpoint of endpoints) {
      if (isStale(endpoint)) refresh(endpoint);
    }
  };

  const playObserver = new PerformanceObserver((list) => {
    if (
      !list
        .getEntries()
        .some(({ name }) => name.includes('/api/stats/playback'))
    ) {
      return;
    }
    lastPlayAt = Date.now();
    clearTimeout(historyTimer);
    historyTimer = setTimeout(refreshStale, historyRefreshDelayMs);
  });

  playObserver.observe({ type: 'resource' });
  document.addEventListener('visibilitychange', refreshStale);
  const interval = setInterval(refreshStale, 60_000);
  refreshStale();

  return () => {
    stopped = true;
    playObserver.disconnect();
    document.removeEventListener('visibilitychange', refreshStale);
    clearInterval(interval);
    clearTimeout(historyTimer);
  };
};
