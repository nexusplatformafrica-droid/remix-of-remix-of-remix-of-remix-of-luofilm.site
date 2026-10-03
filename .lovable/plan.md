# Add all providers from MovieBox-TUI

## What you'll see
- Header: next to MovieBox, Luo, Luganda — new tabs **4KHDHub**, **Dramachi**, **Addons**, **CircleFTP**, **DhakaFlix**.
- Each provider gets its own page (browse + search) and its own watch page, styled like the current MovieBox watch page.
- **Search** asks every provider at once and shows results grouped by provider (a small badge on each poster). Slow or dead providers are skipped after a few seconds so search never hangs.
- **Watch & Download**: every quality a provider returns is listed (8K, 4K/2160p, 1080p, 720p, 480p, HDR/REMUX/x265 releases, file size). Qualities the browser can play go in the player; ones it can't (e.g. MKV/HEVC 4K) appear only under **Download** with the same download button/progress style you have now.

## Honest limits
- **CircleFTP / DhakaFlix** only answer to internet users inside Bangladesh. They will be added, but will show "not reachable" for your Uganda viewers.
- **MovieBox** keeps using only complete single files. Split/DASH versions previously played adverts or broken files, and your project rules forbid bringing them back — so MovieBox shows every complete-file quality it has, nothing fake.
- 4KHDHub links pass through mirror hosts (HubCloud); some mirrors can block or expire — those are hidden when they fail.
- Addons (Stremio/Cinemeta) streams are often torrents; only direct http links can be watched/downloaded in a browser, torrent-only results are hidden.

## Build steps
1. Port each provider from the Rust code into server-side TypeScript (server can reach them; browsers are blocked):
   - 4KHDHub: search + page parser + HubCloud link resolver.
   - Dramachi: search, details, episodes, streams.
   - Addons: Cinemeta catalog/search + addon stream lists.
   - CircleFTP (api /posts) and DhakaFlix indexers.
2. One shared "provider" shape (search, details, sources with quality/size/format/playable flag), plus an all-provider search that merges results.
3. Pass-through download/stream endpoint per provider (same streaming download service you use for MovieBox, so progress & size show).
4. Header tabs, provider pages `/p/<provider>`, watch page `/p/<provider>/<id>`, search page grouped results, quality picker with Play vs Download-only split.
5. Test each provider live and report which ones actually return videos from this server.

## Technical notes
- New `src/lib/providers/*.server.ts` adapters + `src/lib/providers.functions.ts` server fns; proxy route under `src/routes/api/public/provider-file.ts` with host allow-list.
- Existing `/api/public/movie` MovieBox path untouched.
- This is a large port (~9k lines of Rust); delivered in stages, 4KHDHub + Addons first, then Dramachi, then BDIX.
