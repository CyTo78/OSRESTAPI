# OneStream REST API services

**Version:** 1.1.0  
**Author:** Cyril Toussaint

Static web UI plus Azure Functions that proxy [OneStream](https://onestream.com) REST calls using a Personal Access Token (PAT). The PAT stays in the browser session; the API runs server-side with your configured secrets.

## Requirements

- Node.js 18+ (recommended)
- Azure Functions Core Tools (for local API) when running the full stack locally
- An Azure Static Web Apps (or compatible) deployment target if you host on Azure

## Local development

From the repository root:

```bash
npm install
npm run build --prefix api
npm run dev
```

This builds the API, starts Azurite (blob/queue), and serves `./public` with the SWA CLI and `./api` as the Functions app. Use `npm run dev:swa-only` if you already have Azurite running elsewhere.

Configure API secrets in `api/local.settings.json` (copy from `api/local.settings.sample.json` if present). **Do not commit `local.settings.json`** — it is listed in `.gitignore`.

## Recent runs (history)

After a successful call, the UI stores up to **10** recent entries per category (**SQL**, **Data management sequence**, **step**, **data adapter**, **cube view command**) in **localStorage**, keyed by:

- selected **application** name, and  
- a **fingerprint** of the current sign-in (PAT + base URL — the PAT is not stored in localStorage).

The same scheme applies when the app is deployed to **Azure Static Web Apps**: each **origin** (your production URL) has its own localStorage, so behavior matches a normal SPA. History does not sync across browsers or devices.

## Deploying to Azure

Point your Static Web App at this repo (build command for the API as required by your SWA workflow), set application settings for the Function app (base URL, any server-side secrets your proxy needs), and deploy. Ensure production secrets are configured in the Azure portal, not in the repository.

## GitHub

Initialize and push from your machine (replace `YOUR_USER` and repo name):

```bash
cd path/to/onestream-rest-proxy
git init
git add .
git commit -m "Release v1.1.0 — OneStream REST API services"
git branch -M main
git remote add origin https://github.com/YOUR_USER/onestream-rest-proxy.git
git push -u origin main
```
