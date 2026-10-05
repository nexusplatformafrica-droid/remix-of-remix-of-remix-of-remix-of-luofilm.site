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
- All catalog TV-BFF calls (home rails included) must run through server functions (`src/lib/catalog.functions.ts`); the TV gateway blocks browser origins with CORS, so client components must never import `fetchSection`/`searchCatalog` or other `moviebox.ts` functions directly.
- Activity records capture only signed-in users' actionable clicks, internal destinations, and page paths; never store typed field values or other sensitive input.
- Keep every existing sitemap in the sitemap index and robots file when adding a new content-group sitemap, because external indexes may already rely on those URLs.
- Extra providers (4KHDHub, Dramachi, Addons/Cinemeta, CircleFTP, DhakaFlix) live in `src/lib/providers/*.server.ts` behind `src/lib/providers.functions.ts`; source links resolve lazily via tokens and play/download through `/api/public/stream`. Why: provider sites block browsers and their mirror links expire quickly.
- Packages that break the server runtime (e.g. `qrcode`/pngjs) must be dynamically imported inside browser-only handlers; why: one static import crashed every hosted page with "This page didn't load".
- Provider `resolveSource` probes every mirror and returns only ones that answer with real media bytes (unwrapping `?link=` landing pages); why: hosts list dead mirrors first, which produced "file wasn't available" downloads.
- PayPal orders and captures run server-side behind `paypal.functions.ts`, while the v6 Web SDK renders PayPal's real button and modal approval UI; the public client ID lives in code and `PAYPAL_CLIENT_SECRET` stays server-only.
- Card payments use Whop's express "whop-pay" button (floating Whop window) with a floating embedded checkout as fallback, never a new tab or inline full checkout; why: user wants a one-click button that opens Whop's overlay on the page.
- Mobile money (deposits, payouts, wallet balances) runs through PawaPay v2 in `src/lib/pawapay.server.ts` behind `pawapay.functions.ts`; token in `PAWAPAY_API_TOKEN`, `PAWAPAY_ENV=sandbox` switches hosts. Why: API token must never reach the browser.
- Mobile money network detection uses the national prefix table in `countries.ts` first and PawaPay predict-provider only for unknown prefixes; why: PawaPay mislabels many MTN Uganda numbers (077x, 0795x) as Airtel.
- Catalog and subtitle downloads open the same-origin attachment URL directly so the browser's own download manager handles them; no in-app download panel. Why: user wants downloads to behave like the MovieBox website.
- Home rows come only from the MovieBox web home (retried); no search-built or TV-app fallback rows. Why: fallbacks showed outdated sections on other hosts.
- Admin uploads write through the site's authenticated Worker endpoint to the `MOVIE_MAX_MEDIA` Cloudflare R2 binding and serve from the same origin; never use the retired Railway signer. Why: uploads must work on Cloudflare without an external backend URL.
- Display the uploaded MOVIEMAX logo through its Lovable Assets pointer and derive the browser icon from that same upload; keep brand gradients in global CSS and fall back to a bundled/loaded sans font when the requested licensed font is unavailable. Why: visual identity stays consistent without committing a binary or assuming a font license.
- Keep the desktop sidebar as five icon-only links backed by the existing category routes, with TV as a series category and icon assets hosted via Lovable Assets. Why: each chosen icon stays tied to a working destination without browser hotlinks.
