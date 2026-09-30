# Agent instructions

Read [docs/conventions.md](docs/conventions.md), [docs/README.md](docs/README.md) and the newest file in
[docs/handoffs/](docs/handoffs/) before changing anything. `npm run check` must pass before a commit.

Test the UI only in a private Xvfb with `WAYLAND_DISPLAY` unset and `--ozone-platform=x11`, and a throwaway
`LEECH_DATA_DIR`: never open a window on the user's desktop.
