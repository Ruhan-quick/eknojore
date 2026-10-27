# এক নজরে (Eknojore)

A daily Bengali news digest, published as a static website on GitHub Pages.

Each day's edition is a single hand-designed HTML page. The build wraps every edition in the
site's header and footer, makes the newest one the home page, and generates an archive, an
about page, an RSS feed, a sitemap and a 404 page. No dependencies, only Node.js 22 or newer.

## Daily workflow

1. **Add the edition**

   ```sh
   npm run add-edition -- "C:\path\to\ajker-khobor-28-oct-2026.html"
   ```

   This saves it as `editions/2026-10-28.html`. It also moves any embedded base64 fonts into
   `src/assets/fonts/`, so the edition file shrinks from about 680 KB to about 45 KB and every
   day shares the same cached font files. The date is read from the file name (`2026-10-28` or
   `28-oct-2026`). Otherwise, pass `--date 2026-10-28`.

2. **Preview it**

   ```sh
   npm start
   ```

   Then open http://localhost:8080/.

3. **Publish it**

   ```sh
   git add -A
   git commit -m "Edition 2026-10-28"
   git push
   ```

   GitHub Actions builds the site and deploys it within a minute or two.

You can also copy an HTML file straight into `editions/` without using `add-edition`; the build
handles embedded fonts either way. Files whose names start with `_` (such as
`_draft.html`) are skipped.

## First-time GitHub setup

1. Create an empty repository on GitHub, for example `eknojore`.
2. Push this folder to it:

   ```sh
   git init -b main
   git add -A
   git commit -m "First edition"
   git remote add origin https://github.com/<your-username>/eknojore.git
   git push -u origin main
   ```

3. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**.
4. Open the **Actions** tab and re-run the "Deploy to GitHub Pages" workflow if the first run
   failed because Pages was not enabled yet.

The site will be live at `https://<your-username>.github.io/eknojore/`. Links work under that
sub-path because the workflow passes the real Pages URL to the build.

**Custom domain:** add it under **Settings → Pages → Custom domain** and point your DNS at
GitHub ([guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)).
The next deploy picks it up automatically.

## Configuration: `site.config.json`

| Key | Purpose |
| --- | --- |
| `name`, `tagline` | Site name and one-line description (header, footer, feed, social cards) |
| `lang`, `locale` | `bn` / `bn_BD` |
| `url` | Leave empty on GitHub Pages. Set it only to force a URL (e.g. `https://eknojore.com/`) |
| `utcOffset` | Time zone for edition dates in the feed (`+06:00`, Dhaka) |
| `themeColor` | Browser toolbar colour on mobile |
| `recentEditions` | How many earlier editions appear under the latest one on the home page |
| `feedItems` | How many editions the RSS feed keeps |

## What the build reads from an edition

- **Date:** `<meta name="edition-date" content="YYYY-MM-DD">` (added by `add-edition`), or the file name.
- **Title and description:** `<title>` and `<meta name="description">`.
- **Headlines:** every `<h3>` and `<h4>`, in order. The first one is the lead on archive cards; all of them go into the RSS feed.
- **Social card image:** the first `<img>` with an `http(s)` URL.
- **Publish time (optional):** `<meta name="edition-published" content="2026-10-28T07:00:00+06:00">`.

Links that start with `/` (for example `/assets/fonts/…`) are rewritten to the site's real base path.

## Project layout

```
editions/              one HTML file per day (the content)
src/assets/site.css    site header, footer, archive and about styles
src/assets/fonts/      shared web fonts (Anek, Hind), extracted from the editions
src/pages/about.html   text of the পরিচিতি (About) page
src/favicon.svg
scripts/               build.mjs, add.mjs (add-edition), serve.mjs
site.config.json
.github/workflows/deploy.yml
_site/                 build output (not committed)
```
