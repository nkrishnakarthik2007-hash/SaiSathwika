# Sai Sathwika Admin for Windows

This is the native Windows companion for the Sai Sathwika store.

- It opens the same cloud-backed admin workspace used by the customer app.
- Sign in with the Google account that has the store administrator role.
- It uses the shared Supabase database; there is no separate product or order database.
- Internet access is required because the store workspace is hosted by GitHub Pages.
- MSI and NSIS setup EXE packages are the intended release targets, but a Windows build workflow and published installer are not configured yet.
- The current Tauri frontend URL points to this repository's GitHub Pages site; GitHub Pages is not enabled for this repository at present, so the hosted admin UI is not verified as reachable.

The storefront and admin workspace remain one application and one backend. The Windows shell is a desktop entry point for the admin experience.
