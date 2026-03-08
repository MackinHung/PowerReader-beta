# src/ — PowerReader Server + Client Source

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `workers/` | Cloudflare Workers API (backend) |
| `client/` | Client-side utilities (Ollama detection) |
| `dashboard/` | Monitoring dashboard HTML |

## workers/

The main backend deployed to Cloudflare Workers. See `workers/README.md` for details.

## Deployment

```bash
# Build (dry-run) — Node.js < v24 required for wrangler
npx wrangler deploy --dry-run --outdir dist

# Deploy via Cloudflare REST API (workaround for Node.js v24)
# See DEPLOY_GUIDE.md for full instructions
```
