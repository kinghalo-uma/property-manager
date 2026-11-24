# Property Manager

A simple static website for keeping track of properties: address, tenant, rent, status, EPC details and a Google Maps view of each one.

## Features

- Add, edit and delete properties
- EPC rating (A–G), score, certificate date and number, with an automatic expiry date (10 years) and warnings when it is expiring or expired
- Links to the official EPC register (find-energy-certificate.service.gov.uk)
- Google Maps embed for each property, plus optional Street View photo if you add a Maps API key in Settings
- Search and status filter, plus a summary of occupied rent
- Export and import as JSON for backups

## Run it

Open `index.html` in a browser. No build step.

## Host it on GitHub Pages

1. Push these files to your repository.
2. In the repository go to **Settings > Pages**, choose the main branch and the root folder, then save.
3. The site will appear at `https://<your-username>.github.io/<repo-name>/`.

## Privacy

Property data is stored in your browser (localStorage), not in the repository, so it is not published. GitHub Pages sites are public, so anyone can open the page, but they will only see their own browser's data. Do not commit exported `properties.json` files to a public repository if they contain tenant details.

## Google Maps key (optional)

The map embed works without a key. For the Street View photo, create an API key in Google Cloud, enable the Street View Static API, restrict the key to your site's address, and paste it into **Settings**.
