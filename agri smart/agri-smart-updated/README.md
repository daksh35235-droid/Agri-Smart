# Agri-Smart

A downloadable, self-hosted agriculture portal for Indian farmers.

## Features
- Farmer registration and login
- Persistent local server-side JSON database
- Farmer profile, multiple farms, soil tests, crop/yield history
- Government/ICAR agriculture source directory
- India States & Union Territories selector
- Operator/admin dashboard with search, counts, audit log and CSV export
- Responsive UI for desktop and mobile
- Passwords stored as salted PBKDF2 hashes

## Run
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm start`.
4. Open http://localhost:3000

## Storage
Data is stored in `data/db.json`. Back it up regularly. This is intended for local/self-hosted use and is not a production-grade public cloud deployment.

## Official sources included
ICAR, PM-KISAN, Ministry of Agriculture & Farmers Welfare, IMD/Agromet and Soil Health Card references. The source links are external and open in a new tab.


## Language setting update
The website now includes a Settings button where users can choose English or Hindi. The choice is saved in that browser and the original green-and-cream colour palette is unchanged.


## Crop recommendation update (English + Hindi)
- Includes 100+ crop recommendation profiles with English/Hindi names, seasons, regional suitability, soil types, pH ranges, water needs and bilingual explanations.
- Crop search accepts English and Hindi crop names. Crop cards and season guidance follow the language selected in Settings.
- Recommendations show typical soil groups, approximate pH ranges, relative water category, season, broad region preference and an explanation. District is a soft preference so a district not listed in the sample reference data does not automatically remove every crop.
- Soil pH and water categories are broad screening references, not guarantees. Actual suitability depends on variety, soil test, irrigation quality, rainfall, altitude, local sowing window and extension advice.

## Crop reference sources
- ICAR Haryana: https://icar.gov.in/en/node/17265
- ICAR Punjab: https://icar.gov.in/index.php/en/node/17283
- ICAR Rajasthan: https://www.icar.gov.in/en/node/17288
- ICAR Uttarakhand: https://www.icar.gov.in/en/node/17293
- ICAR Kharif Agro-Advisories: https://icar.gov.in/sites/default/files/2025-10/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf
- Soil Health Card portal: https://soilhealth.dac.gov.in/


Crop recommendation database: 200 distinct crop entries with English/Hindi names, season, regional coverage, soil preferences, approximate pH range, water requirement, crop type, and bilingual suitability reasons.


## Expanded crop database
The crop recommendation catalogue contains 200 distinct crop entries covering crop types and specialty crops from multiple Indian regions. Regional suitability and cultivation details are general guidance; verify niche crops and local recommendations with state agriculture departments and ICAR.


## Voice search and voice assistant
- On the Crop Recommendation page, choose **Voice search** to speak a crop name or search phrase. Supported spoken filters include state names, Kharif/Rabi/Zaid, soil types, water categories, and phrases such as “pH 7.2”.
- Choose **Ask by voice** to speak a request and hear a spoken summary of the matching crop recommendations, or choose **Voice assistant: read results** to read current results aloud.
- Voice features use the browser Web Speech API. Use a recent desktop Google Chrome browser, allow microphone access, and keep an internet connection available if the browser's speech recognition service requires it. Some browsers or devices may not support speech recognition.
- Voice recognition and speech playback are processed by browser/platform speech services; this feature does not send recordings to the Agri-Smart server by its own code.

## Security setup (important)

This build does **not** create the public default `admin / Admin@12345` account. Configure the operator account before first startup by setting these environment variables:

- `ADMIN_EMAIL` — your operator email address
- `ADMIN_PASSWORD` — a unique password with at least 12 characters
- `ADMIN_NAME` — optional display name

On Windows PowerShell, for a local run:

```powershell
$env:ADMIN_EMAIL="your-real-email@example.com"
$env:ADMIN_PASSWORD="use-a-unique-password-of-12-or-more-characters"
$env:ADMIN_NAME="Agri-Smart Operator"
npm start
```

On Render, add the same three values under **Environment** for the service, then redeploy. Do not put the password in README, source code, GitHub, or screenshots. The admin account is created on first startup when those variables are present. If an admin already exists in your own database, preserve that database and log in with that account.

**Existing data:** back up `data/db.json` before updating. Keep your existing `data/db.json`; the empty database shipped in this ZIP is only for a fresh installation. Never replace a live database with the ZIP's empty file.

This build adds safer JSON parsing, login and registration throttling, timing-safe password verification, seven-day persistent sessions, farm ownership checks, CSV formula neutralization, security headers, HTTPS HSTS guidance, a Render health endpoint, path traversal protection, gzip for larger static responses, and atomic database writes. It is still a small JSON-file application; use managed PostgreSQL/SQLite and HTTPS for a real multi-farmer production deployment. Review and test all workflows before inviting farmers.


## Sessions, deployment and repository hygiene
- Sessions are stored in `data/db.json` and expire after 7 days. Back up this file securely; it contains active bearer tokens as well as farmer data.
- Render health-check path: `/health`. Set the service health check path to `/health`.
- Render provides HTTPS; use the deployed `https://` address. Do not expose the local development server directly to the public internet. HSTS is sent on HTTPS requests.
- Add `data/db.json` and temporary database files to `.gitignore`; never commit live farmer data or secrets.
- The JSON database is suitable only for small deployments with modest write volume. Move to managed PostgreSQL before scaling.
- Login and registration throttles use the forwarded client IP when present. Ensure the app is deployed behind a trusted proxy that overwrites `X-Forwarded-For`; do not expose it directly to untrusted proxy headers.
