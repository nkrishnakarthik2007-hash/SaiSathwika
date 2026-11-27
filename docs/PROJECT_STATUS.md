# Sai Sathwika — Project Status

Last reviewed: 2026-11-27

## Live Supabase snapshot

- Project: sai-sathwika-commerce; status ACTIVE_HEALTHY; region ap-south-1.
- Products: 0; active categories: 7; active brands: 3.
- Orders: 0; cart rows: 0; customer addresses: 0; profiles: 1.
- Diagnostics table: 25 rows. The contents were not inspected.
- Store name/address and latitude/longitude fields are populated in store_settings; the actual address and coordinates are intentionally not copied into this public status file.
- accepting_orders = false; delivery radius is 2 km; free delivery is enabled; configured delivery fee is ₹0.
- The order schema and current checkout UI use cash on delivery. No online payment provider is configured.
- Do not enable live ordering until products, stock, delivery coverage, staffing, customer support and end-to-end checkout have been verified.

## Android and recent UI work

- Main-branch commit bc6371c (2026-11-27) updates the splash handoff/failsafe, loading fallbacks, Android safe-area handling, responsive admin navigation and reduced-motion behavior.
- These are source-code changes only. No physical-device test or new stable APK verification was completed in this review.
- The updater currently reads the first GitHub release returned by the API. It does not explicitly filter prereleases; decide on a stable-versus-beta update channel before distributing broadly.
- The latest release list could not be independently refreshed in this review. Do not assume the previous known prerelease is still the newest release.

## Storefront and Windows admin

- The Tauri Windows companion exists in source and targets MSI/NSIS, but no verified Windows installer workflow or published installer was found.
- Its Tauri config points the frontend to this repository's GitHub Pages URL with ?admin=1. GitHub Pages is not enabled for this repository, so the hosted admin frontend is not verified.
- Vercel deployment inspection is blocked until the user authorizes the connected team. The storefront's live URL and production deployment remain unverified.
- Google OAuth, Android callback and customer cart/order flows still need a real-device test. A successful web build is not device validation.

## Security and diagnostics

- Supabase health advisor returned no health lints.
- Security advisor flags leaked-password protection as disabled and several SECURITY DEFINER RPC execute grants for review. The inspected anonymous-callable functions contain sign-in/role checks; no database grants or production data were changed.
- Performance advisor flags 8 unindexed foreign keys, 14 RLS auth-initplan warnings, 8 unused indexes and 10 multiple-permissive-policy findings. Review query plans and policy intent before changing indexes or RLS.
- Main-branch diagnostics currently flush automatically after sign-in and on error/online events. This branch adds an explicit customer opt-in guard and a Privacy & Support control. Existing uploaded diagnostic records are not deleted.
- There is no confirmed customer-facing free-text feedback form yet. Add one after the storefront is ready, with category, description, optional reproduction steps and separate consent for diagnostics.

## Exact next steps

1. Review this draft PR and confirm its web/TypeScript build passes.
2. Authorize Vercel team access and verify the actual storefront deployment/domain.
3. Add real product photos, variants, prices and stock.
4. Test Google OAuth, Android callback, cart persistence, delivery checks and COD checkout with controlled test data.
5. Verify the Android release feed and decide whether production devices should receive stable releases only.
6. Keep accepting_orders disabled until the store owner confirms readiness.
