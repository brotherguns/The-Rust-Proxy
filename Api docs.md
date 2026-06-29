🦀 Leech-RS API Documentation
This document describes the HTTP API endpoints exposed by the Leech-RS proxy – a high‑performance, headless LLM gateway for use.ai. All endpoints are compatible with OpenAI and Anthropic client libraries.

Base URL: http://127.0.0.1:8000 (default)
Authentication: None (all requests are free, account management is handled automatically)
Content-Type: application/json (except file uploads)

📡 Endpoints
1. Models
GET /v1/models
Returns the list of available models.
This endpoint is OpenAI‑compatible.

Response

json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-5-4",
      "object": "model",
      "owned_by": "leech",
      "label": "OpenAI GPT-5.4"
    },
    // ... more models
  ]
}
2. Chat Completions (OpenAI)
POST /v1/chat/completions
Creates a chat completion. Supports both streaming and non‑streaming, with optional thinking (reasoning) injection.

Request Body

Field	Type	Description
model	string	Model identifier (e.g. gpt-5-4, claude-opus-4-8, gemini-3-pro, or aliases: default, fast, smart)
messages	array	List of messages with role and content
stream	boolean	If true, response is sent as Server‑Sent Events (SSE)
thinking	boolean, string, or object	Enable reasoning. Can be true, false, a level string ("low", "medium", "high", "max"), or an object {"type":"enabled","budget_tokens":<int>}
Non‑streaming Response

json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-5-4",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Paris is the capital of France."
    },
    "finish_reason": "stop"
  }],
  "thinking": "The user asked about the capital..." // only if `thinking` enabled
}
Streaming Response (SSE)

text
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"Paris"},"finish_reason":null}]}
...
data: {"id":"chatcmpl-...", ... "choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: [DONE]
When thinking is enabled, the stream sends delta objects with a thinking: true flag for reasoning tokens.

Example Request

bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5-4",
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
    "thinking": true
  }'
3. Messages (Anthropic)
POST /v1/messages
Anthropic‑compatible endpoint. Supports thinking as well.

Request Body

Field	Type	Description
model	string	Model identifier
messages	array	List of messages with role and content (content can be a string or an array of text blocks)
system	string	Optional system prompt
max_tokens	integer	(Ignored, kept for compatibility)
thinking	boolean	Enable reasoning
Response

json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hi there!"}],
  "model": "claude-opus-4-8",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 0,
    "output_tokens": 42
  },
  "thinking": "The user said hello..." // included when `thinking` is true
}
Example Request

bash
curl -X POST http://127.0.0.1:8000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-8",
    "messages": [{"role": "user", "content": "Hello"}],
    "thinking": true
  }'
4. Image Analysis
POST /v1/chat/with-image
Analyse an image provided as a base64 data URI or a public URL.

Request Body

Field	Type	Description
model	string	Model to use (default: "default")
image	string	Base64 data URI (e.g. data:image/png;base64,...) or HTTP URL
filename	string	Optional filename (default: "image.png")
question	string	Question about the image (default: "What's in this image?")
stream	boolean	If true, stream the analysis via SSE
Response (non‑streaming)

json
{
  "model": "gpt-5-4",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "This image shows a red apple on a wooden table."
    }
  }]
}
Example Request

bash
curl -X POST http://127.0.0.1:8000/v1/chat/with-image \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KGgo...",
    "question": "What color is the apple?"
  }'
5. Image Upload (Multipart)
POST /v1/chat/upload-image
Upload an image file directly.

Parameters (form‑data)

Field	Type	Description
file	file	Image file (PNG, JPEG, WEBP, GIF, AVIF)
question	string	Optional question
model	string	Optional model (default: "default")
Response

json
{
  "model": "gpt-5-4",
  "question": "What's in this image?",
  "analysis": "A red apple on a table."
}
6. Health & Status
GET /health
Overall health of the proxy.

Response

json
{
  "status": "ok",
  "fresh_accounts": 10,
  "send_success_rate": 1.0,
  "reasons": ["all systems nominal"]
}
GET /bank
Account pool status.

Response

json
{
  "mode": "headless-ws",
  "warm_accounts": 10,
  "pool_target": 10,
  "status": "ok"
}
GET /config
Current runtime configuration.

Response

json
{
  "pool_size": 10,
  "signup_delay_ms": 1000,
  "account_ttl_sec": 1800,
  "proxy_tor": false,
  "tor_socks": "socks5h://127.0.0.1:9050"
}
GET /proxies
List active Tor proxies and current load metrics (new in Rust version).

Response

json
{
  "proxies": [
    "socks5h://127.0.0.1:9050",
    "socks5h://127.0.0.1:9051"
  ],
  "proxy_count": 2,
  "load": {
    "window_requests": 42,
    "requests_per_second": 3.5
  }
}
7. Other Endpoints
GET / – returns a simple HTML page (if frontend is not built, shows a build instruction page).

GET /v1/models – alias for /models.

POST /config – (Stub) intended for runtime config updates.

🔧 Notes
Rate Limiting: The proxy uses a warm account pool; if the pool is empty, it will create an account inline (adds ~1s latency).

Concurrency: The Rust version handles up to 24 concurrent WebSocket streams by default (configurable via direct_max_concurrency).

Tor Scaling: The proxy automatically spawns/kills Tor instances based on load. You can see the current proxies at /proxies.

Error Responses: Errors are returned as JSON with an error field and an appropriate HTTP status code.

🐞 Troubleshooting
Failed to acquire account – wait a few seconds for the pool to fill, or increase account_pool.size in config.toml.

429 Too Many Requests – the proxy will automatically retry with exponential backoff; you can also increase signup_delay_ms in config.

Tor not starting – ensure tor.exe is placed in the tor/ subfolder or in PATH.

📚 License & Disclaimer
This proxy is provided for educational and research purposes. Use responsibly and respect the terms of service of use.ai. The authors are not responsible for any misuse.
