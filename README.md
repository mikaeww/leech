# Leech

A small, fast, quiet web browser for Linux.

Leech puts the frontend of [Search](https://github.com/driceroland/Search), the macOS browser by [Office Commun](https://officecommun.com), on Chromium, for Linux. Same idea: a row of tabs — across the top or down the left — and the page. No toolbar, no start page, no account.

> **Status:** early. See [PLAN.md](PLAN.md) for what exists and what comes next.

## Running

Needs Node.js 22+ and npm.

```sh
npm install
npm start
```

To install it for your user, so app launchers find it (the launcher runs the checkout in `~/Projekte/Apps/leech`; set `LEECH_HOME` in `data/leech` if yours lives elsewhere):

```sh
install -Dm755 data/leech ~/.local/bin/leech
install -Dm644 data/dev.mikaeww.Leech.desktop ~/.local/share/applications/dev.mikaeww.Leech.desktop
```

## Keys

| | |
|---|---|
| `Ctrl+L` address · `Ctrl+K` switch tab · `Ctrl+T` new tab · `Ctrl+W` close · `Ctrl+Shift+T` reopen | `Ctrl+[` `Ctrl+]` back, forward · `Ctrl+Tab` next tab · `Ctrl+1`–`Ctrl+9` jump |
| `Ctrl+Shift+S` tabs across the top or down the left · `Ctrl+S` fold the tabs away | `Ctrl+F` find · `Ctrl+D` duplicate · `Ctrl+Alt+C` copy address · `Ctrl+Shift+V` paste and go |

Click the active tab to edit its address in place. Right-click a tab to pin, rename or mute it.

## Credits

The design, behaviour and injected scripts come from Search by Office Commun (MIT). Leech is not affiliated with Office Commun.

## Licence

MIT, see [LICENSE](LICENSE).
