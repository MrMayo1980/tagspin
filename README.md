# Tagspin

A minimal web image roulette: a search phrase, image count, optional website, Spin, and browser-saved history.

The simplified version replaces all source-specific APIs with **Google Images search through SerpAPI**. Without a website it searches across the web. A website adds a `site:example.com` filter and results are checked against that domain. No search engine indexes literally every image, and unavailable images are skipped.

## Current status

The interface and general-search integration are prepared on `simplify-web-search`. A SerpAPI account/key and hosted search backend must be connected before publishing this revision. The existing GitHub Pages site remains on `main` until live web-search verification passes. The application does not fall back to the old source-specific searches.

## Private setup

1. Create a free SerpAPI account: <https://serpapi.com/users/sign_up?plan=free>.
2. Get the key from <https://serpapi.com/manage-api-key>.
3. For local testing, paste the value after `SERPAPI_API_KEY=` in the ignored `.env` file. Never put the value in `config.json`, client code, a commit, or a chat message.
4. Run `npm start` using Node.js 22 or newer. Visit <http://127.0.0.1:4387>.
5. For public hosting, deploy `backend/worker.js` as a Worker with the `SERPAPI_API_KEY` secret and `ALLOWED_ORIGIN=https://mrmayo1980.github.io`. Set the non-secret `searchEndpoint` in `config.json` to `https://YOUR-BACKEND/api/images`. Keep the frontend on GitHub Pages.

The server-side API key is sent only to SerpAPI. The browser receives normalized image results, never provider credentials or raw error responses. Search inputs go to the search provider. History remains in browser storage, and existing v1 history is preserved.

Run checks with `npm run check`. The backend uses the platform Fetch API and can run in a Cloudflare Worker; `server.mjs` provides the same route for local development. No npm dependencies or frontend build are required.

Image results link to their original source. General search results are not necessarily licensed for reuse; check the original page.
