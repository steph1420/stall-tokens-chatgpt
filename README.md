# Stall Tokens — ChatGPT build

A self-contained copy of the Stall Tokens application source, imported from `steph1420/stall-tokens` branch `chatgpt/beta-work`.

## Deployment

- Site: https://steph1420.github.io/stall-tokens-chatgpt/
- Source code: this repository (`main`)
- Workflow: [Deploy ChatGPT Build](.github/workflows/deploy-pages.yml)

The deployment workflow runs the full project check suite, builds with `VITE_CHANNEL=beta`, and publishes the result to this repository's GitHub Pages site. The Beta storage namespace (`stall-tokens-beta.v2`) remains isolated from Stable data.

## Development

```sh
npm ci
npm run dev
npm run check
```

The original Stable repository, the existing Beta deployment repository, and the ChatGPT working branch/PR are separate and were not modified by this source import.
