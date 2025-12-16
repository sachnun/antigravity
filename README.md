# Antigravity

> **Warning**: This project uses Google's internal API. Use at your own risk.

OpenAI & Anthropic compatible proxy for Google's Antigravity API.

## Setup

```bash
npm install
cp .env.example .env
npm run start:dev
```

Visit `http://localhost:3000/oauth/authorize` to authenticate with Google.

## Endpoints

| Endpoint                    | Format    |
| --------------------------- | --------- |
| `POST /v1/chat/completions` | OpenAI    |
| `POST /v1/messages`         | Anthropic |
| `GET /v1/models`            | OpenAI    |
| `GET /v1/quota`             | -         |

## Models

- `gemini-3-pro-preview`
- `claude-sonnet-4-5`
- `claude-sonnet-4-5-thinking`
- `claude-opus-4-5`

_as of 9-12-2025_

## License

MIT
