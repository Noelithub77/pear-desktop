import { type BrowseEndpoint, watchPageData } from './page-data';

export type TabSpec = {
  label: string;
  shortcut: string;
  // Where the site's own router shows this page, to highlight the tab there too.
  path: string;
  endpoint: BrowseEndpoint;
};

export type Tabs = {
  show: (index: number) => void;
  cycle: (step: number) => void;
  stop: () => void;
};

type Tab = {
  spec: TabSpec;
  // A second copy of the site's page element, kept rendered while hidden.
  view: HTMLElement;
  button: HTMLButtonElement;
  ready: boolean;
  // Data that arrived while the tab was on screen, applied once it is hidden.
  pending: unknown;
  scrollY: number;
};

const isPlayback = (event: Event) => {
  const detail: unknown = event instanceof CustomEvent ? event.detail : null;
  if (!detail || typeof detail !== 'object' || !('endpoint' in detail)) {
    return false;
  }
  const { endpoint } = detail;
  return (
    !!endpoint &&
    typeof endpoint === 'object' &&
    ('watchEndpoint' in endpoint || 'watchPlaylistEndpoint' in endpoint)
  );
};

const closePlayerPage = () => {
  const layout = document.querySelector('ytmusic-app-layout');
  if (layout?.getAttribute('player-ui-state') === 'PLAYER_PAGE_OPEN') {
    document
      .querySelector<HTMLButtonElement>('.toggle-player-page-button')
      ?.click();
  }
};

const navigate = (browseEndpoint: BrowseEndpoint) =>
  document.querySelector('ytmusic-app')?.dispatchEvent(
    new CustomEvent('yt-navigate', {
      bubbles: true,
      composed: true,
      detail: { endpoint: { browseEndpoint } },
    }),
  );

export const startTabs = (specs: TabSpec[]): Tabs => {
  const content = document.querySelector('ytmusic-app-layout > #content');
  const routerPage = content?.querySelector(':scope > ytmusic-browse-response');
  const strip = document.createElement('div');
  strip.className = 'pear-tab-strip';
  strip.setAttribute('role', 'tablist');
  let active: Tab | null = null;

  const highlighted = () =>
    active ?? tabs.find(({ spec }) => spec.path === location.pathname);

  const updateStrip = () => {
    const current = highlighted();
    for (const tab of tabs) {
      tab.button.setAttribute('aria-selected', String(tab === current));
    }
  };

  const setData = (tab: Tab, data: unknown) => {
    tab.ready = true;
    if (tab === active) {
      tab.pending = data;
      return;
    }
    Reflect.set(tab.view, 'data', data);
    tab.scrollY = 0;
  };

  const hide = (tab: Tab) => {
    tab.scrollY = window.scrollY;
    tab.view.hidden = true;
    if (tab.pending !== undefined) {
      setData(tab, tab.pending);
      tab.pending = undefined;
    }
  };

  const show = (tab: Tab) => {
    if (!tab.ready) {
      // Not fetched yet, so open the page the usual way.
      navigate(tab.spec.endpoint);
      return;
    }
    closePlayerPage();
    if (tab === active) return;

    if (active) hide(active);
    active = tab;
    content?.classList.add('pear-tab-active');
    tab.view.hidden = false;
    window.scrollTo(0, tab.scrollY);
    updateStrip();
  };

  // The site's router is opening another page, which replaces the tab.
  const onRouterNavigate = (event: Event) => {
    if (isPlayback(event) || !active) return;
    hide(active);
    active = null;
    content?.classList.remove('pear-tab-active');
    updateStrip();
  };

  const tabs: Tab[] = specs.map((spec) => {
    const view = document.createElement('ytmusic-browse-response');
    // The site scopes its layout styles, such as the space under the top bar, by class.
    view.className = routerPage?.className ?? '';
    view.classList.add('pear-tab-view');
    view.hidden = true;
    const button = document.createElement('button');
    button.className = 'pear-tab';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.textContent = spec.label;
    button.title = spec.shortcut;
    const tab: Tab = {
      spec,
      view,
      button,
      ready: false,
      pending: undefined,
      scrollY: 0,
    };
    button.addEventListener('click', () => show(tab));
    strip.append(button);
    // After the router's own page, so other code that looks up the page finds that one first.
    content?.append(view);
    return tab;
  });

  // The left of the bar holds the logo and, on some pages, the page title.
  document.querySelector('ytmusic-nav-bar #right-content')?.prepend(strip);
  updateStrip();
  window.addEventListener('yt-navigate', onRouterNavigate, true);
  window.addEventListener('popstate', onRouterNavigate);
  navigation.addEventListener('currententrychange', updateStrip);
  const stopData = watchPageData(
    specs.map(({ endpoint }) => endpoint),
    (endpoint, data) => {
      const tab = tabs.find(({ spec }) => spec.endpoint === endpoint);
      if (tab) setData(tab, data);
    },
  );

  return {
    show(index) {
      const tab = tabs.at(index);
      if (tab) show(tab);
    },
    cycle(step) {
      const current = highlighted();
      const from = current ? tabs.indexOf(current) : step > 0 ? -1 : 0;
      show(tabs[(from + step + tabs.length) % tabs.length]);
    },
    stop() {
      stopData();
      window.removeEventListener('yt-navigate', onRouterNavigate, true);
      window.removeEventListener('popstate', onRouterNavigate);
      navigation.removeEventListener('currententrychange', updateStrip);
      content?.classList.remove('pear-tab-active');
      strip.remove();
      for (const { view } of tabs) view.remove();
    },
  };
};
