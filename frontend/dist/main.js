"use strict";
const MODEL_PRICING_PER_MILLION = {
    "gpt-5-5": { input: 4, output: 12 },
    "gpt-5-4": { input: 3, output: 10 },
    "gpt-5-3": { input: 2.5, output: 8 },
    "gpt-5-1": { input: 2, output: 7 },
    "gpt-5": { input: 2, output: 6 },
    "gpt-5-mini": { input: 0.3, output: 1.2 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "claude-sonnet-5": { input: 3, output: 15 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-haiku-4": { input: 0.8, output: 4 },
    "sakana-namazu": { input: 0, output: 0 },
    "sakana-fugu": { input: 0, output: 0 },
    "sakana-fugu-ultra": { input: 0, output: 0 },
    "faceb-openai/gpt-5": { input: 2, output: 6 },
    "faceb-openai/gpt-5.1": { input: 2, output: 7 },
    "faceb-openai/gpt-5.2": { input: 2.5, output: 8 },
    "faceb-openai/gpt-5.3-chat": { input: 3, output: 10 },
    "faceb-openai/gpt-5.4": { input: 3, output: 10 },
    "faceb-openai/gpt-5.5": { input: 4, output: 12 },
    "faceb-anthropic/claude-opus-4": { input: 15, output: 75 },
    "faceb-anthropic/claude-opus-4.1": { input: 15, output: 75 },
    "faceb-anthropic/claude-opus-4.5": { input: 15, output: 75 },
    "faceb-anthropic/claude-opus-4.6": { input: 15, output: 75 },
    "faceb-anthropic/claude-opus-4.7": { input: 15, output: 75 },
    "faceb-anthropic/claude-opus-4.8": { input: 15, output: 75 },
    "faceb-anthropic/claude-fable-5": { input: 3, output: 15 },
    "faceb-google/gemini-3.1-pro-preview": { input: 2, output: 12 },
    "faceb-google/gemini-3.5-flash": { input: 0.3, output: 2.5 },
    "faceb-google/gemini-2.5-pro": { input: 2, output: 10 },
    "faceb-google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "faceb-qwen/qwen3-max": { input: 0.8, output: 2.4 },
    "faceb-qwen/qwen3-coder": { input: 0.8, output: 2.4 },
    "faceb-qwen/qwen3-coder-plus": { input: 0.8, output: 2.4 },
    "faceb-qwen/qwen3.5-397b-a17b": { input: 0.8, output: 2.4 },
    "faceb-mistralai/ministral-14b-2512": { input: 0.1, output: 0.4 },
    "faceb-mistralai/ministral-8b-2512": { input: 0.06, output: 0.24 },
    "faceb-mistralai/ministral-3b-2512": { input: 0.04, output: 0.16 },
    "gemini-3-1-pro": { input: 2, output: 12 },
    "gemini-3-pro": { input: 2, output: 10 },
    "gemini-3-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "deepseek-v4-pro": { input: 0.6, output: 3 },
    "deepseek-v4-flash": { input: 0.2, output: 1 },
    "deepseek-r1": { input: 0.55, output: 2.2 },
    "grok-4": { input: 3, output: 15 },
    "glm-5-2": { input: 0.5, output: 2 },
    "qwen-3-max": { input: 0.8, output: 2.4 },
    "qwen-3-5-397b": { input: 0.8, output: 2.4 },
    "kimi-k2-6": { input: 0.6, output: 2.5 },
    "deepinfra-kimi-k2": { input: 0.5, output: 1.5 },
    "llama-3-3-70b-versatile": { input: 0.3, output: 0.9 }
};
const currency = new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    style: "currency"
});
const state = {
    isSending: false,
    messages: [],
    model: localStorage.getItem("leech-model") ?? "gpt-5-4",
    models: [],
    sessionId: localStorage.getItem("leech-session-id") ?? crypto.randomUUID()
};
localStorage.setItem("leech-session-id", state.sessionId);
function id(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}
function pricingFor(model) {
    return MODEL_PRICING_PER_MILLION[model] ?? { input: 0.5, output: 2 };
}
function estimateSpend(overview) {
    return Object.entries(overview.models).reduce((sum, [model, outputTokens]) => {
        const pricing = pricingFor(model);
        const inputTokens = overview.model_input_tokens?.[model] ?? 0;
        const billedOutput = overview.model_output_tokens?.[model] ?? outputTokens;
        return sum + (inputTokens / 1000000) * pricing.input + (billedOutput / 1000000) * pricing.output;
    }, 0);
}
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
}
function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
        element.textContent = value;
    }
}
function providerSummary(pools) {
    return pools
        .map((pool) => {
        const target = pool.target === null ? "" : `/${pool.target}`;
        return `${pool.provider} ${pool.ready}${target}`;
    })
        .join("  ");
}
function renderModelOptions(models) {
    const select = document.querySelector("#model-select");
    if (!select)
        return;
    const modelList = models.length ? models : [{ id: state.model, label: state.model }];
    select.innerHTML = modelList
        .map((model) => {
        const selected = model.id === state.model ? "selected" : "";
        return `<option value="${escapeHtml(model.id)}" ${selected}>${escapeHtml(model.label ?? model.id)}</option>`;
    })
        .join("");
    if (!modelList.some((model) => model.id === state.model)) {
        state.model = modelList[0]?.id ?? "gpt-5-4";
        localStorage.setItem("leech-model", state.model);
    }
    setText("#composer-model", state.model);
}
function renderMessages() {
    const conversation = document.querySelector("#conversation");
    if (!conversation)
        return;
    if (state.messages.length === 0) {
        conversation.innerHTML = `
      <section class="empty-state">
        <div class="mark">L</div>
        <h1>Leech Chat</h1>
        <div class="suggestions">
          <button class="suggestion" type="button" data-prompt="Give me a quick provider health summary.">Provider health</button>
          <button class="suggestion" type="button" data-prompt="Which model should I use for fast coding tasks?">Pick a model</button>
          <button class="suggestion" type="button" data-prompt="Summarize recent gateway usage.">Usage summary</button>
        </div>
      </section>
    `;
        return;
    }
    conversation.innerHTML = state.messages
        .map((message) => `
      <article class="message ${message.role}" data-message-id="${message.id}">
        <div class="avatar">${message.role === "user" ? "You" : "L"}</div>
        <div class="bubble">${formatMessage(message.content)}</div>
      </article>
    `)
        .join("");
    conversation.scrollTop = conversation.scrollHeight;
}
function formatMessage(content) {
    const escaped = escapeHtml(content.trim() || "...");
    return escaped
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
        .join("");
}
function setSending(isSending) {
    state.isSending = isSending;
    const send = document.querySelector("#send-button");
    const prompt = document.querySelector("#prompt");
    if (send) {
        send.disabled = isSending;
        send.textContent = isSending ? "Sending" : "Send";
    }
    if (prompt) {
        prompt.disabled = isSending;
    }
}
function requestMessages() {
    return state.messages.map((message) => ({
        content: message.content,
        role: message.role
    }));
}
async function sendMessage(content) {
    if (state.isSending)
        return;
    const text = content.trim();
    if (!text)
        return;
    state.messages.push({ content: text, id: id("user"), role: "user" });
    const assistantId = id("assistant");
    renderMessages();
    setSending(true);
    try {
        const response = await fetch("/v1/chat/completions", {
            body: JSON.stringify({
                messages: requestMessages(),
                model: state.model,
                stream: false,
                user: state.sessionId
            }),
            headers: { "content-type": "application/json" },
            method: "POST"
        });
        const payload = await response.json();
        if (!response.ok || payload.error) {
            throw new Error(payload.error ?? `Request failed with ${response.status}`);
        }
        const reply = payload.choices?.[0]?.message?.content;
        const toolCalls = payload.choices?.[0]?.message?.tool_calls;
        state.messages.push({
            content: reply ?? (toolCalls ? JSON.stringify(toolCalls, null, 2) : "No response content."),
            id: assistantId,
            role: "assistant"
        });
    }
    catch (error) {
        state.messages.push({
            content: error instanceof Error ? error.message : String(error),
            id: assistantId,
            role: "assistant"
        });
    }
    finally {
        setSending(false);
        renderMessages();
        void refreshStatus();
    }
}
function resizeComposer() {
    const prompt = document.querySelector("#prompt");
    if (!prompt)
        return;
    prompt.style.height = "auto";
    prompt.style.height = `${Math.min(prompt.scrollHeight, 220)}px`;
}
async function refreshStatus() {
    try {
        const [health, proxies, usage, models] = await Promise.all([
            fetchJson("/health"),
            fetchJson("/proxies"),
            fetchJson("/usage/overview"),
            fetchJson("/v1/models")
        ]);
        state.models = models.data;
        renderModelOptions(models.data);
        setText("#status-pill", health.status.toUpperCase());
        setText("#health-line", providerSummary(health.provider_pools ?? []) || "No provider stats yet");
        setText("#proxy-count", String(proxies.proxy_count));
        setText("#rpm", proxies.load.requests_per_minute.toFixed(2));
        setText("#usage-spend", currency.format(estimateSpend(usage)));
        setText("#usage-tokens", formatNumber(usage.total_tokens));
        setText("#usage-sessions", formatNumber(usage.sessions));
        setText("#favorite-model", usage.favorite_model ?? "n/a");
        renderProviderList(health.provider_pools ?? [], proxies.provider_assignments ?? {});
    }
    catch (error) {
        setText("#status-pill", "OFFLINE");
        setText("#health-line", error instanceof Error ? error.message : String(error));
    }
}
function renderProviderList(pools, assignments) {
    const list = document.querySelector("#provider-list");
    if (!list)
        return;
    if (!pools.length) {
        list.innerHTML = `<li><span>No providers</span><strong>0</strong></li>`;
        return;
    }
    list.innerHTML = pools
        .map((pool) => {
        const target = pool.target === null ? "" : ` / ${pool.target}`;
        const proxyCount = assignments[pool.provider]?.length ?? 0;
        return `
        <li>
          <span>${escapeHtml(pool.provider)}</span>
          <strong>${pool.ready}${target}</strong>
          <small>${proxyCount} proxy routes</small>
        </li>
      `;
    })
        .join("");
}
function newChat() {
    state.messages = [];
    state.sessionId = crypto.randomUUID();
    localStorage.setItem("leech-session-id", state.sessionId);
    renderMessages();
}
function attachEvents() {
    const form = document.querySelector("#chat-form");
    const prompt = document.querySelector("#prompt");
    const select = document.querySelector("#model-select");
    const newChatButton = document.querySelector("#new-chat");
    const refreshButton = document.querySelector("#refresh-status");
    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!prompt)
            return;
        const value = prompt.value;
        prompt.value = "";
        resizeComposer();
        void sendMessage(value);
    });
    prompt?.addEventListener("input", resizeComposer);
    prompt?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            form?.requestSubmit();
        }
    });
    select?.addEventListener("change", () => {
        state.model = select.value;
        localStorage.setItem("leech-model", state.model);
        setText("#composer-model", state.model);
    });
    newChatButton?.addEventListener("click", newChat);
    refreshButton?.addEventListener("click", () => { void refreshStatus(); });
    document.body.addEventListener("click", (event) => {
        const button = event.target.closest("[data-prompt]");
        if (!button || !prompt)
            return;
        prompt.value = button.dataset.prompt ?? "";
        resizeComposer();
        prompt.focus();
    });
}
function renderShell() {
    document.body.innerHTML = `
    <div class="app">
      <aside class="rail">
        <div class="brand">
          <div>
            <strong>Leech-RS</strong>
            <span id="status-pill">Loading</span>
          </div>
        </div>

        <button id="new-chat" class="primary-action" type="button">New chat</button>

        <section class="rail-section">
          <label for="model-select">Model</label>
          <select id="model-select">
            <option value="${escapeHtml(state.model)}">${escapeHtml(state.model)}</option>
          </select>
        </section>

        <section class="rail-section status-block">
          <div>
            <span>Spend</span>
            <strong id="usage-spend">$0.0000</strong>
          </div>
          <div>
            <span>Tokens</span>
            <strong id="usage-tokens">0</strong>
          </div>
          <div>
            <span>Sessions</span>
            <strong id="usage-sessions">0</strong>
          </div>
        </section>

        <section class="rail-section split-stats">
          <div>
            <span>Proxies</span>
            <strong id="proxy-count">0</strong>
          </div>
          <div>
            <span>Req/min</span>
            <strong id="rpm">0.00</strong>
          </div>
        </section>

        <section class="rail-section">
          <div class="rail-heading">
            <span>Providers</span>
            <button id="refresh-status" type="button">Refresh</button>
          </div>
          <ul id="provider-list" class="provider-list"></ul>
        </section>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <span class="thread-label">Gateway chat</span>
            <strong id="favorite-model">n/a</strong>
          </div>
          <p id="health-line">Loading provider status</p>
        </header>

        <section id="conversation" class="conversation"></section>

        <form id="chat-form" class="composer">
          <textarea id="prompt" rows="1" placeholder="Message Leech-RS"></textarea>
          <div class="composer-actions">
            <span id="composer-model">${escapeHtml(state.model)}</span>
            <button id="send-button" type="submit">Send</button>
          </div>
        </form>
      </main>
    </div>
  `;
}
function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
    :root {
      color-scheme: dark;
      --bg: #11100e;
      --surface: #1a1815;
      --surface-alt: #24211d;
      --ink: #f3eee6;
      --muted: #a99f92;
      --line: rgba(243, 238, 230, 0.11);
      --line-strong: rgba(243, 238, 230, 0.19);
      --accent: #d86f50;
      --accent-dark: #f08a66;
      --accent-soft: #32201b;
      --accent-line: rgba(216, 111, 80, 0.42);
      --green: #96b9a3;
      --shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 70% -20%, rgba(216, 111, 80, 0.12), transparent 34%),
        linear-gradient(180deg, #171511 0%, var(--bg) 42%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    button,
    select,
    textarea {
      font: inherit;
      letter-spacing: 0;
    }

    button {
      cursor: pointer;
    }

    .app {
      display: grid;
      grid-template-columns: 292px minmax(0, 1fr);
      min-height: 100vh;
    }

    .rail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 100vh;
      padding: 18px;
      border-right: 1px solid var(--line);
      background: #15130f;
    }

    .brand {
      display: flex;
      align-items: center;
      min-height: 36px;
    }

    .avatar,
    .mark {
      display: grid;
      place-items: center;
      border: 1px solid var(--line-strong);
      background: var(--surface-alt);
      color: var(--green);
      font-weight: 700;
    }

    .brand strong {
      display: block;
      font-size: 1rem;
      line-height: 1.1;
    }

    .brand span {
      color: var(--muted);
      display: block;
      font-size: 0.82rem;
      margin-top: 3px;
    }

    .primary-action,
    #send-button {
      border: 0;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      min-height: 42px;
      padding: 0 16px;
    }

    .primary-action:hover,
    #send-button:hover {
      background: var(--accent-dark);
    }

    #send-button:disabled {
      cursor: wait;
      opacity: 0.62;
    }

    .rail-section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 12px;
    }

    .rail-section label,
    .rail-section span,
    .thread-label,
    .provider-list small,
    .composer-actions span {
      color: var(--muted);
      font-size: 0.82rem;
    }

    select {
      width: 100%;
      min-height: 38px;
      margin-top: 8px;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: var(--surface-alt);
      color: var(--ink);
      padding: 0 10px;
    }

    .status-block,
    .split-stats {
      display: grid;
      gap: 10px;
    }

    .split-stats {
      grid-template-columns: 1fr 1fr;
    }

    .status-block div,
    .split-stats div {
      display: grid;
      gap: 3px;
    }

    .status-block strong,
    .split-stats strong {
      font-size: 1.08rem;
    }

    .rail-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .rail-heading button,
    .suggestion {
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: var(--surface-alt);
      color: var(--ink);
      min-height: 32px;
      padding: 0 10px;
    }

    .rail-heading button:hover,
    .suggestion:hover {
      border-color: var(--accent);
      color: var(--accent-dark);
    }

    .provider-list {
      display: grid;
      gap: 8px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .provider-list li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 10px;
      padding: 9px;
      border-radius: 8px;
      background: var(--surface-alt);
    }

    .provider-list small {
      grid-column: 1 / -1;
    }

    .workspace {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-width: 0;
      min-height: 100vh;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      min-height: 70px;
      padding: 14px 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(17, 16, 14, 0.88);
      backdrop-filter: blur(12px);
    }

    .topbar strong {
      display: block;
      margin-top: 3px;
    }

    .topbar p {
      color: var(--muted);
      margin: 0;
      max-width: 54ch;
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conversation {
      overflow: auto;
      padding: 32px 28px 24px;
    }

    .empty-state {
      align-content: center;
      display: grid;
      gap: 22px;
      justify-items: center;
      min-height: 58vh;
      text-align: center;
    }

    .mark {
      width: 54px;
      height: 54px;
      border-radius: 8px;
      box-shadow: var(--shadow);
      font-size: 1.35rem;
    }

    .empty-state h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 2.65rem;
      font-weight: 500;
      line-height: 1;
      margin: 0;
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      max-width: 760px;
    }

    .message {
      display: grid;
      grid-template-columns: 46px minmax(0, 760px);
      gap: 14px;
      margin: 0 auto 22px;
      max-width: 900px;
    }

    .message.user {
      grid-template-columns: minmax(0, 760px) 46px;
      justify-content: end;
    }

    .message.user .avatar {
      grid-column: 2;
      grid-row: 1;
    }

    .message.user .bubble {
      grid-column: 1;
      grid-row: 1;
      background: var(--accent-soft);
      border-color: var(--accent-line);
    }

    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      font-size: 0.78rem;
    }

    .bubble {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
      line-height: 1.62;
      padding: 16px 18px;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .bubble p {
      margin: 0 0 12px;
    }

    .bubble p:last-child {
      margin-bottom: 0;
    }

    .composer {
      display: grid;
      gap: 10px;
      width: min(900px, calc(100% - 56px));
      margin: 0 auto 24px;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
      padding: 12px;
    }

    textarea {
      width: 100%;
      min-height: 46px;
      max-height: 220px;
      resize: none;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
      line-height: 1.5;
      padding: 6px;
    }

    textarea::placeholder {
      color: #7f7568;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 42px;
    }

    .composer-actions span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 920px) {
      .app {
        grid-template-columns: 1fr;
      }

      .rail {
        min-height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .workspace {
        min-height: calc(100vh - 360px);
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .topbar p {
        max-width: 100%;
        text-align: left;
      }

      .conversation {
        padding: 26px 16px 20px;
      }

      .message,
      .message.user {
        grid-template-columns: 38px minmax(0, 1fr);
      }

      .message.user .avatar {
        grid-column: 1;
      }

      .message.user .bubble {
        grid-column: 2;
      }

      .avatar {
        width: 34px;
        height: 34px;
      }

      .composer {
        width: calc(100% - 28px);
        margin-bottom: 14px;
      }
    }
  `;
    document.head.appendChild(style);
}
injectStyles();
renderShell();
attachEvents();
renderMessages();
void refreshStatus();
setInterval(() => { void refreshStatus(); }, 15000);
