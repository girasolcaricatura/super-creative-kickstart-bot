# Super Creative Kickstart Bot

Slack bot que genera munición creativa para briefs, usando Claude.

Corre en Cloudflare Workers (free tier).

## Endpoints

- `GET /` — health check
- `POST /kickstart` — slash command de Slack

## Secrets necesarios

Configurar en el Dashboard de Cloudflare → Workers → Settings → Variables:

- `ANTHROPIC_API_KEY` — desde console.anthropic.com
- `SLACK_BOT_TOKEN` — desde api.slack.com (xoxb-...)

## Modelo y costos

En `src/index.js`:

- `ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'` — mejor calidad creativa (default)
- `MAX_TOKENS = 2500` — equilibrio entre completitud del output y timeout del Worker

Costos estimados por brief con esta config: ~$0.045 USD.
Para bajar costos ~10× cambiar a `claude-haiku-4-5-20251001`.
