# Verification — simplified general-search revision

The previous source-specific release was verified and published on `main`. This revision is on `simplify-web-search` and has not replaced the live site.

- All direct Wikimedia, NASA, Flickr and Openverse integrations have been removed from application search code.
- A single server-side SerpAPI Google Images request is used for general web results. Website restrictions are opt-in `site:` queries with domain checks on returned results.
- Automated checks cover validation, unconfigured search, result parsing, URL safety, domain filtering, duplicate elimination, count limits, old-history compatibility, provider failures, secret redaction, and backend request handling.
- Live Google Images search is pending the owner's SerpAPI key. Fixture-driven tests do not establish a working live provider connection.

## Browser checks

- The simplified desktop page has only the search phrase, count, optional website, Spin, and history.
- Existing browser history from the previous version is retained.
- A separate test server clearly labeled “TEST PREVIEW · Sample images” was used to verify loading, image switching, winner selection, repeat spins, and history without pretending that fixture results came from live search.
- Mobile layout at 390 × 844 has no horizontal overflow; inputs and controls remain usable.
- Repeat spins append history and the entries survive a reload.
- The unconfigured search server shows a recoverable error; no restricted source is used as a fallback.

Live provider search and the revised GitHub Pages deployment remain pending the owner's API key and backend connection.
