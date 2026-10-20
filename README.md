# Tagspin

A minimal image roulette: search phrase, image count, optional website, Spin, and browser-saved history. No visitor accounts, search API keys, or paid search subscriptions are required.

## Search

A self-hosted SearXNG instance gathers general image results from Bing Images, Brave Images, and DuckDuckGo Images when each engine is available. There are no direct Wikimedia, NASA, Flickr, or other catalog adapters. Results can come from any website indexed by the working search engines. An optional website adds a `site:example.com` query and client-side domain matching.

The small Node API returns image URLs and source pages, caches successful searches for five minutes, and limits repeated requests. Results must match every meaningful search word in their caption; generic captions need evidence in the image or source path. The roulette uses the highest-ranked matching results up to the requested count. It reports a smaller pool when necessary, and editing the search clears the previous pool. Matching uses search metadata, so it cannot guarantee the visual contents of every indexed image. The public tunnel exposes only the search API and an explicit list of public frontend assets. It does not expose backend source files, private configuration, or the SearXNG administration interface. Image usage rights remain with the original creators.

## Public trial

Working trial: <https://volvo-teach-village-bennett.trycloudflare.com/>

The frontend is configured for GitHub Pages. `config.json` points to a Cloudflare Quick Tunnel connected to the search service on the owner's computer. The same tunnel also serves a copy of the frontend. The restart helper checks the public health response before reusing a tunnel and replaces expired connections. After a replacement, publish the updated configuration to GitHub Pages.

**This is a working trial, not always-on hosting. Search is available only while the owner's computer, SearXNG container, Node API and tunnel are running.** Cloudflare Quick Tunnels have no uptime guarantee. Restarting the tunnel can change its URL; republish the updated `config.json` afterward. For permanent availability, move the same search services to an always-on host and use a stable HTTPS endpoint.

## Run

Requirements: Node.js 22+, Podman, and the official `cloudflared` binary. This checkout has the verified Cloudflare client at `~/.local/bin/tagspin-cloudflared`; other installations can set `CLOUDFLARED_BIN` or use `cloudflared` on PATH.

```sh
npm run start:search
npm start
```

The first command starts the search components in the background and updates `config.json` with the trial endpoint. The frontend preview is at <http://127.0.0.1:4387>. Local preview calls the same search adapter directly. Stop the search service with:

```sh
npm run stop:search
```

SearXNG's exact tested container image is pinned in `backend/start-search.mjs`. Container configuration, generated internal session secrets, logs and process IDs stay in ignored `.local/`. There is no user-supplied API key. Earlier SerpAPI configuration is unused.

Run all checks with `npm run check`. No npm dependency installation or frontend build is required. The existing v1 browser history is preserved and the newest 100 winners are retained.

## References

- SearXNG: <https://docs.searxng.org/>
- Cloudflare Quick Tunnels: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>
- Source repository: <https://github.com/MrMayo1980/tagspin>
