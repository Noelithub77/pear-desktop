# Pear Desktop fork

Personal fork of [pear-devs/pear-desktop](https://github.com/pear-devs/pear-desktop), an Electron wrapper around the music site. `origin` is the fork and `upstream` is pear-devs. Keep changes small and in new files where possible so upstream merges stay easy.

## Layout

- `src/plugins/<name>/index.ts`: plugins, discovered automatically by `vite-plugins/plugin-importer.mts`.
- `src/plugins/keyboard-navigation`: this fork's preloaded Home, History and global Charts tabs (Alt+Esc, Alt+H, Alt+G, Ctrl+Tab). `tabs.ts` keeps extra copies of the site's `ytmusic-browse-response` page element rendered beside the router's own page, so clicks inside them reach the site's router and player as usual; `page-data.ts` fetches and refreshes their data. Both rely on undocumented site internals (`networkManager.fetch`, the element's `data` property, the `/api/stats/playback` ping).
- `tools/ops.mjs`: operator entry point.
- `tests/`: Playwright tests that launch the app against the live site. Run them from a built tree (`pnpm build`) with a disposable HOME, because they read and write the real app profile.

## Operator commands

Discover with `pnpm ops --help`.

| Command | Effect |
| --- | --- |
| `pnpm ops deploy` | Builds an x64 AppImage and replaces `~/AppImages/youtube_music.appimage`, keeping the old file as `.previous`. |
| `pnpm ops deploy --dry-run --json` | Reports the target and commit without building or installing. |

## Checks

`pnpm lint`, `pnpm typecheck` and `pnpm test`.
