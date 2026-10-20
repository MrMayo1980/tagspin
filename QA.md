# Verification — no-key web search

Checked on 20 October 2026.

## Automated

26 passing tests cover input validation, safe image/source URLs, optional domain filtering, unique result pools, count limits, existing history compatibility, no-key SearXNG requests, image-result parsing, partial engine failures, empty results, network/rate-limit errors, malformed responses, and API origin/method handling. Application, backend, and lifecycle scripts pass syntax checks.

## Live checks

- Three public SearXNG instances rejected automated requests (HTTP 429). They are not used by the application.
- A dedicated local SearXNG container returned hundreds of image results. It is restricted to the general engines Bing, Brave, and DuckDuckGo plus their image engines; unavailable engines do not prevent results from working engines.
- The Node API returned 100 normalized image results for `cats` and for `ocean` with no search API credentials.
- A public Cloudflare Quick Tunnel returned HTTP 200 and the expected GitHub Pages CORS response for a real image search.
- The lifecycle launcher successfully started detached API/tunnel processes and wrote the public endpoint to `config.json`.
- The simplified browser interface completed a real `cats` roulette with a pool of 5, displayed a source link, and appended saved history.
- An optional `pexels.com` filter completed a roulette with a pool of 4 and linked back to that domain.
- The live mobile layout at 390 × 844 loaded the image and had no horizontal overflow.

## Relevance regression checks

Live result pools for `red panda`, `black cats`, and `northern lights` each returned five matching results. A browser roulette for `red panda` displayed a red panda and appended history.

- Relevance tests reject partial phrases, substring matches such as cat/cathedral, unrelated captions, and matches found only in a hostname or search URL parameter.
- The requested pool retains the highest-ranked matching images; lower-ranked results are not randomly substituted. Random selection happens only within that pool.
- Both backend and frontend apply matching and optional website restrictions. Empty matching results are reported without broadening the query.
- In the browser, editing the search immediately clears the old image, source link, and pool; saved history remains available.

## Publication

GitHub Pages serves the simplified frontend. On 20 October, the previous Quick Tunnel expired while the client process remained alive, causing the published search endpoint to stop resolving. The local search engine and API remained healthy. A replacement public connection passed its health check and completed a live `cats` roulette with five images and saved history. The lifecycle helper now verifies the public health response before reusing a running tunnel, replaces expired connections, and waits for the new connection before changing `config.json`. Regression tests cover expired DNS, provider error pages, invalid health responses, and successful reuse. Running the helper again reused the healthy replacement address.

## Availability

The search backend is a temporary trial running on the owner's computer. It requires that computer and its search processes to remain online. Quick Tunnel URLs can change on restart. Permanent always-on availability has not been established.
