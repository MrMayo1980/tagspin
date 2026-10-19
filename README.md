# Tagspin

A little serendipity, one image tag at a time. A responsive image roulette with an animated reel, real image search, creator attribution, and history saved in your browser.

## Use

Enter a tag, choose an image type and a pool of 2–50 images, optionally specify a website, then give it a spin. Spin the same collection again without another search. Open any image to see its original source and license. The History tab keeps the last 100 winners, supports JSON export, and can restore the settings of a previous discovery.

## Sources and limitations

- No website: Wikimedia Commons. `wikimedia.org`, `commons.wikimedia.org`, and `wikipedia.org` select Commons.
- `nasa.gov` or `images.nasa.gov`: NASA Images API.
- `flickr.com`: Flickr's direct public JSONP feed, with up to 20 recent matching images. No API key is needed. The feed does not include license details, so each image links to its Flickr page for usage terms.
- Other websites: Openverse, with strict matching of the original page or original image hostname, including subdomains. Known providers such as Flickr are also filtered at the API. Up to five pages of 20 results are searched. Websites absent from the index may have no matches. This is an indexed search, not a general website crawler.
- Wikimedia and NASA refine image type with a search keyword, Flickr adds an extra tag, and Openverse uses its image category filter.
- If fewer images match or load than requested, the site reports the actual pool size. A spin requires at least two successfully loaded images.
- Third-party APIs and images require an internet connection. Rate limits, network failures, blocked hotlinks, and unavailable websites show recoverable errors. The Openverse service could not be reached from the development environment; its integration is covered with API-response tests, and live availability depends on the service.
- Each image links to its source and available license. Check the source's terms before reuse. The welcome collage embeds Unsplash images.

Search terms go directly from the browser to the selected provider. There is no backend, login, API key, analytics, or tracking service. History is local to the current browser and origin; clearing browser storage removes it. Export creates a JSON backup. If storage is blocked or full, history lasts only for the current visit and the site displays a notice.

## Run locally

Requires Node.js 22 or newer. No dependencies or build step.

```sh
npm start
```

Open `http://127.0.0.1:4387`. Run validation with:

```sh
npm run check
```

Tests cover settings and URL validation, provider selection, parsing and attribution, domain filtering and pagination, unique image pools, history persistence and corrupted data, zero/one result searches, rate limits, cancellation, and network errors. Browser checks are recorded in `QA.md`.

## GitHub Pages

The site uses relative asset paths and works under a repository subpath. Publish the `main` branch from `/ (root)` in repository Settings → Pages. `.nojekyll` disables Jekyll processing. `.github/workflows/checks.yml` runs validation on pushes and pull requests.
