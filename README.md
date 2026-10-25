# Shifts

A small offline-first PWA for shift workers. Pick a shift pattern, say when it starts, and see a calendar of your shifts.

- Presets (4 on 4 off, 2-2-3, rotations) or a custom repeating cycle
- Change pattern from any date; earlier dates keep the old pattern
- Several people, switch between them
- Light, dark or automatic theme; English and Romanian
- Data stays in the browser (localStorage) and every file is cached for offline use
- Backup/restore as JSON from Settings

No build step. Plain HTML, CSS and JS.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 (service workers need `localhost` or HTTPS).

## Deploy to GitHub Pages

Settings > Pages > Deploy from a branch > `main` / root. All paths are relative, so it works under `/<repo>/`.

When you change any file, bump `CACHE` in `sw.js` so installed copies refresh.

## Add a language

Copy the `en` block in `i18n.js`, rename the key to the language code, and translate. It shows up in Settings automatically.
