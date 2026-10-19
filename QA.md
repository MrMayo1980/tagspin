# Verification — no-key web search

Checked on 19 October 2026.

## Automated

18 passing tests cover input validation, safe image/source URLs, optional domain filtering, unique result pools, count limits, existing history compatibility, no-key SearXNG requests, image-result parsing, partial engine failures, empty results, network/rate-limit errors, malformed responses, and API origin/method handling. Application, backend, and lifecycle scripts pass syntax checks.

## Live checks

- Three public SearXNG instances rejected automated requests (HTTP 429). They are not used by the application.
- A dedicated local SearXNG container returned hundreds of image results. It is restricted to the general engines Bing, Brave, and DuckDuckGo plus their image engines; unavailable engines do not prevent results from working engines.
- The Node API returned 100 normalized image results for `cats` and for `ocean` with no search API credentials.
- A public Cloudflare Quick Tunnel returned HTTP 200 and the expected GitHub Pages CORS response for a real image search.
- The lifecycle launcher successfully started detached API/tunnel processes and wrote the public endpoint to `config.json`.
- The simplified browser interface completed a real `cats` roulette with a pool of 5, displayed a source link, and appended saved history.
- An optional `pexels.com` filter completed a roulette with a pool of 4 and linked back to that domain.
- The live mobile layout at 390 × 844 loaded the image and had no horizontal overflow.

## Availability

The search backend is a temporary trial running on the owner's computer. It requires that computer and its search processes to remain online. Quick Tunnel URLs can change on restart. Permanent always-on availability has not been established.
