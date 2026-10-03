<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Catalog playback and downloads must use only direct full-file resources from the TV BFF through `/api/public/movie`; never restore mobile resource, DASH, or stream-rebuild fallbacks because they served promos or incomplete files.
- Catalog downloads stream the authenticated `/api/public/movie` response through the same-origin download service worker; why: the browser manager needs real size/progress while protected preview hosts reject a separate unauthenticated attachment navigation.
- All catalog TV-BFF calls (home rails included) must run through server functions (`src/lib/catalog.functions.ts`); the TV gateway blocks browser origins with CORS, so client components must never import `fetchSection`/`searchCatalog` or other `moviebox.ts` functions directly.
- Activity records capture only signed-in users' actionable clicks, internal destinations, and page paths; never store typed field values or other sensitive input.
- Keep every existing sitemap in the sitemap index and robots file when adding a new content-group sitemap, because external indexes may already rely on those URLs.
- Extra providers (4KHDHub, Dramachi, Addons/Cinemeta, CircleFTP, DhakaFlix) live in `src/lib/providers/*.server.ts` behind `src/lib/providers.functions.ts`; source links resolve lazily via tokens and play/download through `/api/public/stream`. Why: provider sites block browsers and their mirror links expire quickly.
- Packages that break the server runtime (e.g. `qrcode`/pngjs) must be dynamically imported inside browser-only handlers; why: one static import crashed every hosted page with "This page didn't load".
- Download/probe fetches and the download service worker use `credentials: "same-origin"`, never `"include"`; why: media CDNs answer `Access-Control-Allow-Origin: *`, which browsers reject for credentialed cross-origin redirects.
- Provider `resolveSource` probes every mirror and returns only ones that answer with real media bytes (unwrapping `?link=` landing pages); why: hosts list dead mirrors first, which produced "file wasn't available" downloads.
- PayPal checkout runs server-side (`src/lib/paypal.server.ts` behind `paypal.functions.ts`); the public client ID lives in code, the secret is read from `PAYPAL_CLIENT_SECRET` only on the server; why: a secret in code would ship in the repo/bundle.
