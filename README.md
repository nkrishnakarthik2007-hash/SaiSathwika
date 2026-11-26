# Sai Sathwika

A single-store dairy and ice-cream commerce application.

## Planned stack
- React + TypeScript + Vite
- Capacitor for Android
- Supabase Auth, PostgreSQL, Storage and Row Level Security
- GitHub for source code, builds and releases
- Website hosted on a commercial-use-compatible platform

## Roles
- Super Admin: full control and administrator management
- Admin: products, inventory, orders and promotions
- Staff: assigned shop operations
- Delivery Staff: assigned deliveries

## Data safety
This project must use a dedicated Supabase project. Do not connect it to NKKAMS or student-attendance. Never commit secrets or Supabase service-role keys.

## Status
An early working prototype now includes the customer storefront, Google sign-in flow, Supabase schema and RLS, admin dashboard, cart/order flow, delivery-radius checks, diagnostics and Android packaging. The live store is **not ready to accept orders**: the database currently has no products, no configured store coordinates and `accepting_orders` is false. GitHub Pages is not enabled for this repository, so the public storefront host is not yet verified. The Windows admin companion is source-only until its installer workflow and hosted frontend are configured. Checkout currently uses cash on delivery; no online payment gateway is connected.

## Android releases and updates

- Android releases use the permanent signing key configured in GitHub Actions.
- The APK is published as `SaiSathwika.apk` with the app's launcher icon embedded.
- The app checks GitHub Releases and downloads newer APKs inside the app.
- Android's Package Installer presents the final confirmation; the app does not silently install updates.
- Regular updates use the same package ID and signing key, so they install over the existing app without an uninstall.

## Diagnostics

- GitHub Actions uploads build logs and a build summary as a `sai-sathwika-build-logs-<run>` artifact for 90 days.
- Runtime JavaScript errors stay on the device by default. A signed-in customer can explicitly opt in from **My Profile → Privacy & Support** before any diagnostics are uploaded.
- Opted-in reports sync to the private `public.app_diagnostics` table; only the designated super-admin can read them. Customers can turn sharing off at any time; reports already uploaded remain in the support database.
- Logs redact common token and secret query parameters. Error messages and stack traces may still contain technical details, so diagnostics are never uploaded without consent.
