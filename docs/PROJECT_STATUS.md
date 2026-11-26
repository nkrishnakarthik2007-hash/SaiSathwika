# Sai Sathwika Project Status

Last reviewed: 2026-11-27

## Live Supabase snapshot
- Project status: `ACTIVE_HEALTHY`.
- Products: 0; active categories: 7; active brands: 3.
- Orders: 0; cart rows: 0; customer addresses: 0.
- Profiles: 1; existing diagnostic records: 11 (their contents were not inspected).
- Store setting: `accepting_orders = false`, delivery radius 2 km, delivery fee ₹0.
- Store latitude and longitude are not configured; no delivery-location rows exist.
- The order schema currently records `cash_on_delivery` with `pending` payment status. No payment-provider table or gateway integration was found.
- Do not enable live ordering until products, real store coordinates, delivery coverage, staffing and checkout tests are complete.

## Android
- Latest release: `v0.1.204`, marked as a prerelease, with a 5.5 MB `SaiSathwika.apk` asset.
- The 2026-11-26 Android build completed successfully. The permanent signing configuration step ran successfully and the debug-build fallback was skipped.
- The app includes Google OAuth callback handling, cloud cart restore/sync and a server-side `place_order` RPC with stock and delivery-radius checks.
- Google provider enablement and redirect allowlist still need a real sign-in test. A successful CI build is not device validation.
- Current updater checks the newest GitHub release; all recent releases are prereleases, so keep this as a testing channel until a deliberate stable-release process is chosen.

## Storefront and Windows admin
- GitHub Pages is not enabled for this repository and no Pages deployment workflow is present.
- The Tauri Windows admin shell exists in source, but no Windows MSI/NSIS build workflow or published Windows installer was found.
- Its Tauri config points the remote frontend at the repository's GitHub Pages URL, which is not currently configured. The Windows companion is therefore not verified as usable.
- Vercel project/deployment inspection is blocked until the user authorizes the connected Vercel team. The live storefront URL remains unverified.

## Security and diagnostics
- Supabase reports no health lints, but flags leaked-password protection as disabled.
- Five SECURITY DEFINER RPCs are flagged as executable by authenticated users. Source review found internal role/assignment checks in the inspected functions; do not revoke these grants blindly because the app calls the RPCs.
- Performance advisor reports 7 unindexed foreign keys, 14 RLS auth-initplan warnings, 9 unused indexes and 10 multiple-permissive-policy warnings. Review query plans and policy intent before changing them.
- Existing diagnostics were automatically uploaded after sign-in without explicit consent. Draft PR #1 adds a customer opt-in control and a consent guard; its first CI attempt exposed a missing npm lockfile/cache assumption, which was removed from the workflow. Await the rerun.

## Feedback, growth and monetisation
- The admin has a Live Health diagnostics view, but there is no customer-facing feedback form yet.
- Add a simple customer feedback/report form after the storefront and product catalogue are ready; do not silently upload customer data.
- Do not add payment collection, donations or ads yet. Start with a real product catalogue, accurate prices/stock, delivery coverage, customer support and repeat orders. Add a donation/sponsorship link only after the store is genuinely operating; integrate a payment gateway only after the user selects and approves a provider.

## Exact next steps
1. Review PR #1 and confirm the TypeScript/web build passes.
2. Authorize Vercel access and identify the real storefront deployment/domain.
3. Add verified product photos, prices, variants and stock; configure the actual store coordinates and delivery radius.
4. Test Google OAuth, cart persistence, delivery validation and cash-on-delivery checkout using controlled test data.
5. Only then decide when to enable real order acceptance and whether a payment gateway is needed.
