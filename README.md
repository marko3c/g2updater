# G2 Profile Manager

Internal tool for managing Tricentis G2 product listing data across 9 products.

## Stack

- Node.js HTTP server (no framework)
- Vanilla JS frontend — no build step
- JSON files on disk — no database

## Local setup

```bash
node server.js
# → http://localhost:3000
```

Node 18+ required. No dependencies to install.

## Structure

```
server.js          HTTP server + REST API
public/
  index.html       Shell
  main.js          All frontend logic
  styles.css       Styles
data/
  fields.json      Master field schema (shared across all products)
  product-*.json   Per-product data files
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products |
| GET | `/api/fields` | Field schema |
| GET | `/api/product/:slug` | Get product data |
| POST | `/api/product/:slug` | Save product data |

## Products

`neoload` · `tosca` · `testim` · `testim-mobile` · `qtest` · `vera` · `data-integrity` · `livecompare` · `sealights`

## Deployment

Deployed via [Railway](https://railway.app). Push to `main` to deploy.

> **Note:** Railway's filesystem is ephemeral — saved changes to product JSON files will be lost on redeploy. For persistent storage, migrate `/data` to a volume mount in Railway or switch to a key-value store.
