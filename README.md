# Kairos static page

A static site: plain HTML, CSS and JavaScript, no build step, no network requests, no dependencies.
Publish this folder as the site root (for example GitHub Pages, "Deploy from a branch", folder set to this directory,
or copy its contents to a `docs/` folder or a `gh-pages` branch). All paths are relative, so it also works under a
project sub-path such as `https://<user>.github.io/<repo>/`.

| File | Role |
| --- | --- |
| `index.html` | Page structure. Every visible string carries a `data-i18n` key. |
| `styles.css` | All styling. Colours are defined once in `:root`. |
| `i18n.js` | English and Chinese copy. Keep both languages in step. |
| `app.js` | Canvas drawing, the opening path playback, the case explorer, language switch, figure viewer, reading navigation. |
| `assets/cases.js` | Data for the six displayed cases. Do not edit by hand. |
| `assets/landscape.js` | Geometry of the opening landscape. |
| `assets/*.svg` | Figure panels. |

Open `index.html` in a browser to preview locally. `?lang=zh` opens the Chinese version.

## Before making it public

- `index.html` contains `<meta name="robots" content="noindex,nofollow,noarchive">`. It asks search engines not to
  list the page; it does not hide the files. Anyone with the repository address can read everything in this folder.
  Remove the tag only when the work is released.
- The figures and the case data come from unpublished research. Publishing this folder publishes them.
- The GitHub and preprint cards in the `#source` section are placeholders marked "Coming soon" and have no link yet.
  When the addresses exist, wrap each card in an `<a href="…">` (the two HTML comments there mark the spots).
