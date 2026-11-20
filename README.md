# Stall Tokens — ChatGPT build

This repository owns a separate GitHub Pages deployment for the ChatGPT working build.

## Deployment

- Site: https://steph1420.github.io/stall-tokens-chatgpt/
- Source: [`steph1420/stall-tokens`, branch `chatgpt/beta-work`](https://github.com/steph1420/stall-tokens/tree/chatgpt/beta-work)
- Workflow: [Deploy ChatGPT Build](.github/workflows/deploy-pages.yml)

The deployment workflow checks out the source branch, runs the full project check suite, builds with `VITE_CHANNEL=beta`, and publishes the result here. This uses the Beta storage namespace (`stall-tokens-beta.v2`) so it remains isolated from Stable data.

## Important distinction

The application source is currently built from the source repository; this repository contains the independent deployment workflow, not a full copy of the source tree or its Git history. The source branch and existing Stable/Beta repositories are left unchanged.

To deploy, enable **Settings → Pages → Build and deployment → Source: GitHub Actions**, then run the workflow from the Actions tab (or push a change to this repository's `main` branch).
