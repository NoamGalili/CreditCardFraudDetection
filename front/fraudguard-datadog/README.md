# FraudGuard Command Center

A Datadog-inspired Vite + React dashboard for a final project fraud detection agent console.

## Run

```bash
cd fraudguard-datadog
npm install
npm run dev
```

## Important

This version pins Vite to `5.4.14` and `@vitejs/plugin-react` to `4.3.4`, so it avoids the Node `22.11.0` issue caused by newer Vite versions requiring Node `22.12.0+`.

## Screens

- Overview dashboard
- Incident queue
- Transaction investigation
- Customer notification preview
- Service health layer
- Analytics charts
- Geo risk table
- Settings placeholder

## Project structure

```text
src/
  data/mockData.js
  utils/format.js
  App.jsx
  main.jsx
  styles.css
```

You can later split `App.jsx` into separate components and pages once the design is approved.
