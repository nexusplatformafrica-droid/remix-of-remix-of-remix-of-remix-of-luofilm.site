# Roadmap

- [x] Remove every legacy DASH and mobile-source playback fallback.
- [x] Make direct TV full-file downloads the only catalog download path.
- [x] Fix watch-page hydration mismatch.
- [x] Verify source lookup, playback relay, download response, typecheck, and watch page.
- [x] Replace whole-file buffering with validated, resumable TV range downloads.
- [x] Store download progress and movie/episode/subtitle metadata for safe resume.
- [ ] Speed up full-movie downloads without breaking pause, resume, refresh, or signed-link recovery.
- [ ] Add secure referral tracking and repeatable rewards for both users.
- [ ] Correct device allowances, including existing yearly subscriptions saved as one device.
- [x] Expand sitemap coverage for the verified public site URL.
- [x] Replace the referral artwork with a natural, crisp photo and preload it before showing the banner.
- [x] Add privacy-safe signed-in activity tracking and an admin activity view with user name and phone when available.
- [x] Preserve the current sitemap index and add separate series and animation discovery files.
- [x] Whop: new key, find company id, embed Whop native checkout (card/Google/Apple)
- [x] Fix hosted-site crash ("This page didn't load") caused by the QR code library.
- [x] Fix provider downloads saving "file not available" (dead mirrors) and Moviebox/subtitle downloads on the hosted site.
- [x] Add live PayPal checkout (membership modal + pay page); fix Whop embedded form receiving a URL instead of a session id.
- [ ] Whop live payments: blocked until WHOP_API_KEY and WHOP_COMPANY_ID are added (user action).
