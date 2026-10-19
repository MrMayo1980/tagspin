# Verification

Checked on 19 October 2026 before repository initialization and publication.

## Automated checks

- JavaScript syntax validation for application and source logic.
- 12 passing Node.js tests covering input and URL validation; source selection; Commons, NASA, Flickr and Openverse response handling; domain matching; duplicate elimination; pagination bounds; history persistence and corrupted data; zero/one results; API limits; network failures; malformed responses; and cancellation.
- HTML checks: unique IDs, existing label targets, and all relative local assets present.

## Browser checks

- Desktop welcome page: photos load, form renders, navigation works.
- Live Wikimedia search for `cats`, requested pool of 5: loaded images, animated winner, collection of 5, creator credit and original source/license links.
- Repeated spin of the same collection: history increments without another search.
- History survives a reload. Opening a history item shows its search settings and attribution; exploring its tag restores the form settings.
- Live `nasa.gov` search for `moon`, requested pool of 4: loaded NASA images, collection and saved winner.
- Live direct `flickr.com` search for `cats`, requested pool of 3: all 3 thumbnails loaded, roulette completed, credited winner saved.
- Mobile layout at 390 × 844: stacked form and roulette, two-column collection/history, no horizontal overflow. Desktop sizing restored afterward.
- History JSON export downloaded successfully and parsed: all 4 test spins present.
- Clear-history confirmation opens; cancel preserves history.

## External-service limitation

Openverse's documentation endpoint was available, but live image-search requests timed out from both the browser and terminal, including a 55-second connectivity check. The site handles this with a recoverable message and preserves the previous collection/history. Openverse parsing, filtering, limits and failure cases pass automated tests; successful live searches for arbitrary indexed websites could not be verified. Wikimedia, NASA and Flickr are independent direct integrations and passed live browser checks.

The clear-history destructive action, blocked browser-storage behavior, and reduced-motion preference are covered by implementation review rather than destructive changes to the browser or device settings.
