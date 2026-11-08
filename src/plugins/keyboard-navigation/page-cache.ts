import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

export type BrowseEndpoint = {
  browseId: string;
  formData?: { selectedValues: string[] };
};

export type PageCache = {
  // Serve the next request for this page from memory, if it is fresh.
  claim: (endpoint: BrowseEndpoint) => void;
  stop: () => void;
};

type Entry = { body: string; fetchedAt: number };

const refreshAfterMs = 10 * 60 * 1000;
const serveWithinMs = 2 * refreshAfterMs;
// The page's request follows the shortcut at once; later requests are other navigations.
const claimWithinMs = 2000;
// Gives the server a moment to add the new play before history is fetched again.
const historyRefreshDelayMs = 3000;
const historyKey = JSON.stringify(['FEmusic_history', null]);

const keyOf = ({
  browseId,
  formData,
}: {
  browseId?: unknown;
  formData?: unknown;
}) => JSON.stringify([browseId, formData ?? null]);

const isBrowseRequest = (input: unknown): input is Request =>
  input instanceof Request && input.url.includes('/youtubei/v1/browse');

const readBody = async (request: Request) => {
  let stream = request.clone().body;
  if (!stream) return null;
  // The site gzips its request bodies.
  if (request.headers.get('content-encoding') === 'gzip') {
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }
  const body: unknown = await new Response(stream).json().catch(() => null);
  return body && typeof body === 'object' ? body : null;
};

export const startPageCache = (endpoints: BrowseEndpoint[]): PageCache => {
  const entries = new Map<string, Entry>();
  const inFlight = new Set<string>();
  const originalFetch = window.fetch;
  let claimed: { key: string; at: number } | null = null;
  // History gains an entry with every recorded play, so older copies are stale.
  let lastPlayAt = 0;
  let historyTimer: ReturnType<typeof setTimeout> | undefined;

  const isFresh = (key: string, entry: Entry | undefined, withinMs: number) =>
    !!entry &&
    Date.now() - entry.fetchedAt < withinMs &&
    (key !== historyKey || entry.fetchedAt > lastPlayAt);

  const refresh = async (endpoint: BrowseEndpoint) => {
    const key = keyOf(endpoint);
    const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
    if (!app || inFlight.has(key)) return;
    inFlight.add(key);
    const fetchedAt = Date.now();
    try {
      const data = await app.networkManager.fetch<unknown, BrowseEndpoint>(
        '/browse',
        endpoint,
      );
      entries.set(key, { body: JSON.stringify(data), fetchedAt });
    } catch {
      // Without an entry the page loads from the network as usual.
    } finally {
      inFlight.delete(key);
    }
  };

  const refreshStale = () => {
    if (document.hidden) return;
    for (const endpoint of endpoints) {
      const key = keyOf(endpoint);
      if (!isFresh(key, entries.get(key), refreshAfterMs)) refresh(endpoint);
    }
  };

  const cachedFetch: typeof window.fetch = async (input, init) => {
    if (!claimed || !isBrowseRequest(input)) return originalFetch(input, init);
    if (Date.now() - claimed.at > claimWithinMs) {
      claimed = null;
      return originalFetch(input, init);
    }
    const body = await readBody(input);
    if (!body || 'continuation' in body || keyOf(body) !== claimed.key) {
      return originalFetch(input, init);
    }

    const { key } = claimed;
    claimed = null;
    const entry = entries.get(key);
    if (entry && isFresh(key, entry, serveWithinMs)) {
      return new Response(entry.body, {
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });
    }

    const fetchedAt = Date.now();
    const response = await originalFetch(input, init);
    if (response.ok) {
      response
        .clone()
        .text()
        .then(
          (text) => entries.set(key, { body: text, fetchedAt }),
          () => {},
        );
    }
    return response;
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

  window.fetch = cachedFetch;
  playObserver.observe({ type: 'resource' });
  document.addEventListener('visibilitychange', refreshStale);
  const interval = setInterval(refreshStale, 60_000);
  refreshStale();

  return {
    claim(endpoint) {
      claimed = { key: keyOf(endpoint), at: Date.now() };
    },
    stop() {
      if (window.fetch === cachedFetch) window.fetch = originalFetch;
      playObserver.disconnect();
      document.removeEventListener('visibilitychange', refreshStale);
      clearInterval(interval);
      clearTimeout(historyTimer);
    },
  };
};
