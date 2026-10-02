<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/leech-light.png"><img src="assets/leech.png" width="96" alt="Leech icon"></picture></p>

# Leech

A small, fast, quiet web browser for Linux, on its own Chromium build.

A row of tabs across the top or down the left, and the page. No toolbar, no start page, no account.

[Roadmap](docs/roadmap.md) · [Documents](docs/README.md) ·
[Report an issue](https://github.com/mikaeww/leech/issues)

> [!NOTE]
> Leech is early. There is no release or package yet, you build Chromium yourself.

## Features

- Tabs across the top or down the left, folded away with one key
- A switcher on `Ctrl+K` and an address field with inline completion
- Spaces, each with its own tabs and, if you want, its own sign-ins
- Essentials shared by every space, folders of tabs, and Clear for every tab that isn't pinned
- Split view: two tabs side by side, kept across a restart
- Tabs sleep after 30 minutes away and wake where they were, with their history
- An archive for tabs left alone for a day or a week, off unless you turn it on
- A media bar at the foot of the sidebar for the last tab that played
- Private tabs that never reach the session, history or zoom memory
- A shield that blocks a built-in list of trackers, paused per site
- Hide any element on a page and keep it hidden
- Passwords sealed in the desktop keyring through libsecret
- Bookmarks and history imported from Chrome, Chromium, Brave, Vivaldi, Edge, Zen, Firefox and LibreWolf
- Reading mode, picture-in-picture and link peek
- Chrome extensions from the Web Store, behind one door
- Your own colours: the window as one colour or a smooth gradient, an accent and the new tab's picture
- Chromium's settings (sites, languages, passwords, downloads) inside Leech's own
- Chromium 154 underneath, so Google, DRM and sign-ins behave like in Chrome

## Install

**Arch / CachyOS:** tested on Hyprland. Build Chromium first (see [Building](#building)), then install the launcher,
the desktop entry and the icon for your user:

```sh
install -Dm755 data/leech ~/.local/bin/leech
install -Dm644 data/dev.mikaeww.Leech.desktop ~/.local/share/applications/dev.mikaeww.Leech.desktop
install -Dm644 assets/leech-light.png ~/.local/share/icons/hicolor/256x256/apps/dev.mikaeww.Leech.png
```

The launcher expects the checkout in `~/Projekte/Apps/leech` and the Chromium build in
`~/Projekte/Apps/leech-chromium/src/out/Leech`. Set `LEECH_HOME` and `LEECH_CHROMIUM` if yours live elsewhere.

From a release build (`chromium/args-release.gn` in `out/Release`), `node tools/stage.mjs <src>/out/Release <prefix>`
lays out an installed copy that needs no checkout: `<prefix>/bin/leech` starts `<prefix>/lib/leech/chrome` with
the UI beside it.

## Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+L` | Address |
| `Ctrl+K` | Switch tab |
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+Tab`, `Ctrl+1` to `Ctrl+9` | Next tab, jump to tab |
| `Ctrl+[` / `Ctrl+]` | Back / forward |
| `Alt+1` to `Alt+9` | Switch space |
| `Ctrl+Shift+S` | Tabs across the top or down the left |
| `Ctrl+S` | Fold the tabs away |
| `Ctrl+Shift+N` | Private tab |
| `Ctrl+F` | Find |
| `Ctrl+D` | Duplicate tab |
| `Ctrl+Alt+C` | Copy address |
| `Ctrl+Shift+V` | Paste and go |
| `Ctrl+Shift+R` | Reading mode |
| `Ctrl+Shift+H` | Hide an element |
| `Ctrl+,` | Settings |

Click the active tab to edit its address in place. Right-click a tab to pin, rename or mute it.

## Building

Leech is a WebUI (`ui/`) on a patched Chromium 154.0.8037.57. You need
[depot_tools](https://chromium.googlesource.com/chromium/tools/depot_tools.git), about 40 GB of disk and a few hours.

```sh
mkdir leech-chromium && cd leech-chromium
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PWD/depot_tools:$PATH"
gclient config --unmanaged --name src https://chromium.googlesource.com/chromium/src.git
gclient sync --revision src@refs/tags/154.0.8037.57 --no-history --nohooks && gclient runhooks

cd src
git apply ~/Projekte/Apps/leech/chromium/patches/leech.patch
ln -s ~/Projekte/Apps/leech/chromium/leech chrome/browser/ui/leech
mkdir -p out/Leech && cp ~/Projekte/Apps/leech/chromium/args.gn out/Leech/
gn gen out/Leech
autoninja -C out/Leech chrome
```

For working on the UI alone there is the older Electron shell. Needs Node.js 22 or newer:

```sh
npm install
npm start          # the UI in the Electron shell
npm run check      # lint, structure check, unit tests: must pass before a commit
```

How the code is laid out and the rules it follows: [docs/](docs/README.md), starting with
[conventions](docs/conventions.md) and the [architecture overview](docs/architecture/overview.md).

## License

MIT, see [LICENSE](LICENSE).

## Thanks

The design, behaviour and injected scripts come from **Search** by Office Commun (MIT).
Leech is not affiliated with Office Commun.
