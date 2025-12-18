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
- `gemini-3-flash`
- `claude-sonnet-4-5`
- `claude-opus-4-5`

_as of 16-12-2025_

## Reasoning/Thinking Mode

Enable reasoning mode by setting `reasoning_effort` in your request:

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [...],
  "reasoning_effort": "low",
  "stream": true
}
```

**Values**: `low`, `medium`, `high`

**Model behavior**:

- `gemini-3-pro-preview`: Uses `thinkingLevel` (low/high)
- `claude-sonnet-4-5`: Uses `thinkingBudget` (8192/16384/32768 tokens)
- `claude-opus-4-5`: Always uses thinking mode (parameter optional)

**Known limitation**: Claude models only return `reasoning_content` in streaming mode. Non-streaming requests will process thinking internally but won't return it in the response.

## License

MIT
