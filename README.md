# Property Manager

A simple static website for keeping track of properties. Everything is stored in your own Google Drive, so nothing is held in the browser or on a server.

## What it does

- Add, edit and delete properties (address, tenant, rent, status, EPC details)
- Attach documents and photos to each property (EPC PDFs, tenancy agreements, inspection photos)
- EPC expiry check (10 years from the certificate date) with warnings
- Google Maps embed for each property, plus optional Street View photo
- Search and status filter

## How storage works

- Sign in with Google once per visit. The site asks only for the `drive.file` permission, so it can see only files it created, nothing else in your Drive.
- It creates a folder called **Property Manager** in your Drive.
- Property details are saved in `properties.json` in that folder.
- Each property gets its own sub-folder for documents and photos.
- You can open and manage all of it directly in Google Drive too.

Setup steps are in [SETUP-GOOGLE.md](SETUP-GOOGLE.md).

## Host it on GitHub Pages

1. In the repository go to **Settings > Pages**.
2. Choose the `main` branch and the root folder, then save.
3. The site appears at `https://<your-username>.github.io/<repo-name>/`.

## Limits of this first version

- Single user. If two people or two devices edit at the same moment, the last save wins.
- Access tokens last about an hour, then the site asks you to click Connect again.
- The map embed works without a key; Street View photos need an optional Maps API key in Settings.
