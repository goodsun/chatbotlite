// --- localStorage namespace (path-scoped to avoid collisions on same-origin hosts like github.io) ---
const LS_PREFIX =
  "cbl_" +
  location.pathname.replace(/\/index\.html$/, "/").replace(/([^/])$/, "$1/") +
  "_";
function lsGet(key) {
  return localStorage.getItem(LS_PREFIX + key);
}
function lsSet(key, value) {
  localStorage.setItem(LS_PREFIX + key, value);
}
function lsRemove(key) {
  localStorage.removeItem(LS_PREFIX + key);
}

// --- State ---
let chatHistory = [];
let isLoading = false;
let abortController = null;
let memory = lsGet("memory") || "";
let turnsSinceLastSummary = 0;
let soulConfig = {}; // Loaded from soul/config.json
const SOUL_DIR = document.currentScript?.dataset?.soul || "./soul";
const SUMMARY_INTERVAL = 10; // Summarize every N turns

// --- DOM ---
const apiKeyInput = document.getElementById("apiKey");
const rememberCb = document.getElementById("rememberCb");
const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const welcome = document.getElementById("welcome");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose = document.getElementById("settingsClose");
const systemPrompt = document.getElementById("systemPrompt");
const modelSelect = document.getElementById("modelSelect");
const botTitle = document.getElementById("botTitle");
const ragUrlInput = document.getElementById("ragUrl");

// --- Key obfuscation (not encryption — just hides from casual DevTools inspection) ---
function obfuscateKey(key) {
  return btoa(key.split("").reverse().join(""));
}
function deobfuscateKey(stored) {
  try {
    return atob(stored).split("").reverse().join("");
  } catch {
    return "";
  }
}

// --- Init ---
const isRemember = lsGet("remember") === "1";
rememberCb.checked = isRemember;
if (isRemember) {
  apiKeyInput.value = deobfuscateKey(lsGet("api_key") || "");
}

// --- Soul loader ---
async function loadSoul() {
  const soulErrors = [];

  // persona.txt → system prompt
  try {
    const res = await fetch(`${SOUL_DIR}/persona.txt`);
    if (res.ok) {
      const text = await res.text();
      if (text.trim()) systemPrompt.value = text.trim();
    }
  } catch (e) {
    soulErrors.push("persona.txt");
  }

  // config.json → model, title, temperature, etc.
  try {
    const res = await fetch(`${SOUL_DIR}/config.json`);
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.model) modelSelect.value = cfg.model;
      if (cfg.title) {
        botTitle.value = cfg.title;
        document.querySelector(".header h1").textContent = "😈 " + cfg.title;
        document.querySelector(".welcome h2").textContent = "😈 " + cfg.title;
        document.title = cfg.title;
      }
      if (cfg.welcome) {
        const wp = document.querySelector(".welcome p");
        if (wp) wp.innerHTML = sanitize(cfg.welcome);
      }
      if (cfg.icon) {
        document.querySelector(".header h1").textContent =
          cfg.icon + " " + (cfg.title || "ChatBot Lite");
        document.querySelector(".welcome h2").textContent =
          cfg.icon + " " + (cfg.title || "ChatBot Lite");
      }
      if (cfg.avatar) {
        const img = document.getElementById("welcomeImg");
        if (img) img.src = cfg.avatar;
      }
      if (cfg.subtitle) {
        const ps = document.querySelectorAll(".welcome p");
        if (ps[1]) ps[1].innerHTML = sanitize(cfg.subtitle);
      }
      // Mascot bust-up
      if (cfg.bustup) {
        const bustup = document.getElementById("mascotBustup");
        bustup.src = cfg.bustup;
        bustup.classList.remove("hidden");
      }
      // Store for sendMessage (scoped, not global)
      soulConfig = cfg;
    }
  } catch (e) {
    soulErrors.push("config.json");
  }

  // memory.txt → initial memory (seed) — only if specified in config
  if (soulConfig.seedMemory) {
    try {
      const res = await fetch(soulConfig.seedMemory);
      if (res.ok) {
        const text = await res.text();
        if (text.trim() && !memory) memory = text.trim();
      }
    } catch (e) {
      soulErrors.push("memory.txt");
    }
  }

  // knowledge.txt → append to system prompt — only if specified in config
  if (soulConfig.knowledge) {
    try {
      const res = await fetch(soulConfig.knowledge);
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) {
          systemPrompt.value += "\n\n【参考知識】\n" + text.trim();
        }
      }
    } catch (e) {
      soulErrors.push("knowledge.txt");
    }
  }

  // style.css → load via <link> (CSP-compatible) — only if specified in config
  if (soulConfig.stylesheet) {
    try {
      const res = await fetch(soulConfig.stylesheet, { method: "HEAD" });
      if (res.ok) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = soulConfig.stylesheet;
        document.head.appendChild(link);
      }
    } catch (e) {
      soulErrors.push("style.css");
    }
  }

  // Notify user if soul files failed to load (network errors only — 404 is OK)
  if (soulErrors.length > 0) {
    console.warn("Soul files failed to load:", soulErrors);
    const notice = document.createElement("div");
    notice.className = "msg system";
    notice.textContent = `⚠️ 設定ファイル読み込みエラー: ${soulErrors.join(", ")}（チャット機能は使えます）`;
    chatArea.appendChild(notice);
  }
}

// Load soul, then apply localStorage overrides
await loadSoul();

// No auto-validation on startup — only validate when user interacts with the key field

// Restore chat history from previous session
const savedHistory = lsGet("history");
if (savedHistory) {
  try {
    const parsed = JSON.parse(savedHistory);
    if (Array.isArray(parsed) && parsed.length > 0) {
      chatHistory = parsed;
      // Render previous messages (mark as restored to skip auto-TTS)
      welcome.style.display = "none";
      const prevAutoTts = ttsAutoCb.checked;
      ttsAutoCb.checked = false;
      for (const msg of chatHistory) {
        addMessage(msg.role === "user" ? "user" : "bot", msg.parts[0].text);
      }
      ttsAutoCb.checked = prevAutoTts;
      // Show session restore notice
      const notice = document.createElement("div");
      notice.className = "msg system";
      notice.textContent = "— 前回の会話を復元しました —";
      chatArea.appendChild(notice);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  } catch (e) {}
}

// Restore RAG URL
const savedRagUrl = lsGet("rag_url");
if (savedRagUrl) ragUrlInput.value = savedRagUrl;
// soul config can set ragUrl default
if (soulConfig.ragUrl && !ragUrlInput.value)
  ragUrlInput.value = soulConfig.ragUrl;

ragUrlInput.addEventListener("change", () =>
  lsSet("rag_url", ragUrlInput.value),
);

const savedPrompt = lsGet("system_prompt");
if (savedPrompt) systemPrompt.value = savedPrompt;

const savedModel = lsGet("model");
if (savedModel) modelSelect.value = savedModel;

const savedTitle = lsGet("title");
if (savedTitle) {
  botTitle.value = savedTitle;
  document.querySelector(".header h1").textContent = "💬 " + savedTitle;
  document.querySelector(".welcome h2").textContent = "💬 " + savedTitle;
  document.title = savedTitle;
}

// --- Events ---
document.getElementById("keyVisBtn").addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

sendBtn.addEventListener("click", () => {
  if (isLoading && abortController) {
    abortController.abort();
  } else {
    sendMessage();
  }
});

const securityModal = document.getElementById("securityModal");
const modalConfirm = document.getElementById("modalConfirm");
const modalCancel = document.getElementById("modalCancel");

function showSecurityModal() {
  return new Promise((resolve) => {
    securityModal.classList.add("active");
    const onConfirm = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onOverlay = (e) => {
      if (e.target === securityModal) {
        cleanup();
        resolve(false);
      }
    };
    const cleanup = () => {
      securityModal.classList.remove("active");
      modalConfirm.removeEventListener("click", onConfirm);
      modalCancel.removeEventListener("click", onCancel);
      securityModal.removeEventListener("click", onOverlay);
    };
    modalConfirm.addEventListener("click", onConfirm);
    modalCancel.addEventListener("click", onCancel);
    securityModal.addEventListener("click", onOverlay);
  });
}

rememberCb.addEventListener("change", async () => {
  if (rememberCb.checked) {
    if (!(await showSecurityModal())) {
      rememberCb.checked = false;
      return;
    }
    lsSet("remember", "1");
    lsSet("api_key", obfuscateKey(apiKeyInput.value));
  } else {
    lsSet("remember", "0");
    lsRemove("api_key");
  }
});

apiKeyInput.addEventListener("change", () => {
  if (rememberCb.checked) lsSet("api_key", obfuscateKey(apiKeyInput.value));
  validateApiKey();
});

apiKeyInput.addEventListener("blur", () => {
  validateApiKey();
});

// --- API Key Validation ---
let validateTimer = null;
async function validateApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.style.borderColor = "#3a2a5a";
    return;
  }
  // Debounce
  if (validateTimer) clearTimeout(validateTimer);
  validateTimer = setTimeout(async () => {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        { method: "GET", headers: { "x-goog-api-key": key } },
      );
      if (res.ok) {
        apiKeyInput.style.borderColor = "#22c55e";
        apiKeyInput.title = "✅ APIキー有効";
      } else {
        apiKeyInput.style.borderColor = "#ef4444";
        apiKeyInput.title = "❌ APIキーが無効です";
      }
    } catch {
      apiKeyInput.style.borderColor = "#f59e0b";
      apiKeyInput.title = "⚠️ 接続できません";
    }
  }, 500);
}

systemPrompt.addEventListener("change", () => {
  lsSet("system_prompt", systemPrompt.value);
});

modelSelect.addEventListener("change", () => {
  lsSet("model", modelSelect.value);
});

botTitle.addEventListener("change", () => {
  const t = botTitle.value.trim() || "メフィ";
  const icon = soulConfig.icon || "💬";
  lsSet("title", t);
  document.querySelector(".header h1").textContent = icon + " " + t;
  document.querySelector(".welcome h2").textContent = icon + " " + t;
  document.title = t;
});

// ハンバーガーメニュー
hamburgerBtn.addEventListener("click", () =>
  settingsOverlay.classList.add("open"),
);
settingsClose.addEventListener("click", () =>
  settingsOverlay.classList.remove("open"),
);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
});

// 設定パネルを開くたびにmemoryPreviewを更新
hamburgerBtn.addEventListener("click", () => {
  const mp = document.getElementById("memoryPreview");
  mp.textContent = memory ? "💭 Memory: " + memory : "💭 Memory: (empty)";
});

document.getElementById("clearMemory").addEventListener("click", () => {
  if (!confirm("記憶をクリアしますか？")) return;
  memory = "";
  lsRemove("memory");
  document.getElementById("memoryPreview").textContent = "💭 Memory: (empty)";
});

document.getElementById("clearHistory").addEventListener("click", () => {
  if (!confirm("会話履歴をクリアしますか？")) return;
  chatHistory = [];
  lsRemove("history");
  turnsSinceLastSummary = 0;
  // Remove all messages but keep the welcome element
  chatArea
    .querySelectorAll(".msg, .msg-row, .msg.system")
    .forEach((el) => el.remove());
  chatArea.appendChild(welcome);
  welcome.style.display = "";
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
});

// --- Markdown (lightweight) ---
// --- Markdown (marked.js with fallback) ---
if (typeof marked !== "undefined") {
  const markedOpts = {
    breaks: true,
    gfm: true,
    renderer: (() => {
      const r = new marked.Renderer();
      r.link = function ({ href, text }) {
        const u = (href || "").toLowerCase().replace(/[\s\u0000-\u001f]/g, "");
        if (
          u.startsWith("javascript:") ||
          u.startsWith("data:") ||
          u.startsWith("vbscript:")
        )
          return text;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      };
      return r;
    })(),
  };
  marked.setOptions(markedOpts);
}

function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    return marked.parse(text);
  }
  // Fallback: escape HTML, bold, and convert newlines to <br>
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// --- Sanitizer (DOMPurify) ---
function sanitize(html) {
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "code",
        "pre",
        "a",
        "ul",
        "ol",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "span",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "class"],
      ALLOW_DATA_ATTR: false,
    });
  }
  // Fallback: strip all HTML tags if DOMPurify failed to load
  return html.replace(/<[^>]*>/g, "");
}

// --- Memory ---
function getSystemPromptWithMemory() {
  let prompt = systemPrompt.value;
  if (memory) {
    prompt += "\n\n【過去の会話の記憶】\n" + memory;
  }
  return prompt;
}

// --- TTS (Google Cloud Text-to-Speech) ---
let ttsAudio = null;
const TTS_VOICE = "ja-JP-Wavenet-B";
const TTS_LANG = "ja-JP";
const ttsAutoCb = document.getElementById("ttsAutoCb");
// Restore auto-TTS preference
ttsAutoCb.checked = lsGet("tts_auto") === "1";
ttsAutoCb.addEventListener("change", () =>
  lsSet("tts_auto", ttsAutoCb.checked ? "1" : "0"),
);

async function speakText(text, button) {
  // Stop if already playing
  if (ttsAudio && !ttsAudio.paused) {
    ttsAudio.pause();
    ttsAudio.currentTime = 0;
    document
      .querySelectorAll(".tts-btn.playing")
      .forEach((b) => b.classList.remove("playing"));
    if (window.speechSynthesis) speechSynthesis.cancel();
    return;
  }

  const key = apiKeyInput.value.trim();
  if (!key) {
    alert("APIキーを入力してください（右上の ☰ → Settings）");
    return;
  }

  // Strip markdown/HTML for cleaner speech
  const clean = text
    .replace(/[#*_`~\[\]()>|]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n+/g, "。")
    .trim();
  if (!clean) return;

  const truncated = clean.slice(0, 5000);
  button.classList.add("loading");

  // Try Cloud TTS first, fallback to Web Speech API
  let cloudOk = false;
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: truncated },
          voice: { languageCode: TTS_LANG, name: TTS_VOICE },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
        }),
      },
    );

    if (res.ok) {
      const data = await res.json();
      const audioBytes = atob(data.audioContent);
      const audioArray = new Uint8Array(audioBytes.length);
      for (let i = 0; i < audioBytes.length; i++)
        audioArray[i] = audioBytes.charCodeAt(i);
      const blob = new Blob([audioArray], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      ttsAudio = new Audio(url);
      button.classList.remove("loading");
      button.classList.add("playing");
      ttsAudio.play();
      ttsAudio.onended = () => {
        button.classList.remove("playing");
        URL.revokeObjectURL(url);
      };
      cloudOk = true;
    }
  } catch (e) {
    console.warn("Cloud TTS failed, falling back to Web Speech API:", e);
  }

  // Fallback: Web Speech API
  if (!cloudOk) {
    button.classList.remove("loading");
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(truncated);
    utter.lang = TTS_LANG;
    utter.rate = 1.0;
    // Try to find a Japanese voice
    const voices = speechSynthesis.getVoices();
    const jaVoice = voices.find((v) => v.lang.startsWith("ja"));
    if (jaVoice) utter.voice = jaVoice;
    button.classList.add("playing");
    utter.onend = () => button.classList.remove("playing");
    utter.onerror = () => button.classList.remove("playing");
    speechSynthesis.speak(utter);
  }
}

let isSummarizing = false;
async function summarizeIfNeeded(key) {
  turnsSinceLastSummary++;
  if (turnsSinceLastSummary < SUMMARY_INTERVAL || isSummarizing) return;
  turnsSinceLastSummary = 0;
  isSummarizing = true;

  // Build conversation text for summary
  const recentTurns = chatHistory
    .slice(-20)
    .map((m) => `${m.role === "user" ? "User" : "Bot"}: ${m.parts[0].text}`)
    .join("\n");

  const prevMemory = memory ? `Previous memory:\n${memory}\n\n` : "";

  try {
    const model = modelSelect.value;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${prevMemory}Recent conversation:\n${recentTurns}\n\nSummarize the key facts, user preferences, and important context from this conversation into a concise memory note (max 500 chars). Write in the same language the user used. Only output the summary, nothing else.`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) {
        memory = summary.trim();
        try {
          lsSet("memory", memory);
        } catch (e) {
          console.warn("localStorage quota exceeded, memory not saved");
          addMessage(
            "bot",
            "⚠️ ブラウザの保存容量が上限に達し、記憶を保存できませんでした。「🗑 記憶クリア」または「🗑 履歴クリア」で空きを作ってください。",
          );
        }
      }
    }
  } catch (e) {
    /* silent fail */
  } finally {
    isSummarizing = false;
  }
}

// --- Chat ---
function addMessage(role, content) {
  if (welcome) welcome.style.display = "none";

  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "bot");

  if (role === "user") {
    div.textContent = content;
    chatArea.appendChild(div);
  } else {
    div.innerHTML = sanitize(renderMarkdown(content));
    // Add TTS button
    const ttsBtn = document.createElement("button");
    ttsBtn.className = "tts-btn";
    ttsBtn.title = "🔊 読み上げ";
    ttsBtn.textContent = "🔊";
    ttsBtn.addEventListener("click", () => speakText(content, ttsBtn));
    div.appendChild(ttsBtn);
    // Auto-speak if enabled (only for new messages, not history restore)
    if (ttsAutoCb.checked && !div.dataset.restored) {
      setTimeout(() => speakText(content, ttsBtn), 100);
    }
    // Wrap bot message with icon if configured
    const iconSrc = soulConfig.botIcon;
    if (iconSrc) {
      const row = document.createElement("div");
      row.className = "msg-row";
      const icon = document.createElement("img");
      icon.className = "msg-icon";
      icon.src = iconSrc;
      icon.alt = "";
      row.appendChild(icon);
      row.appendChild(div);
      chatArea.appendChild(row);
    } else {
      chatArea.appendChild(div);
    }
  }

  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "typing";
  div.id = "typing";
  div.textContent = soulConfig.typingMessage || "考え中…";
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

// --- RAG Search ---
async function ragSearch(query) {
  const url = ragUrlInput.value.trim();
  if (!url) return "";
  try {
    const res = await fetch(`${url}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return "";
    return (
      "\n\n【参考情報（RAG検索結果）】\n" +
      results.map((r, i) => `[${i + 1}] ${r}`).join("\n\n")
    );
  } catch (e) {
    console.warn("RAG search failed:", e);
    return "";
  }
}

async function sendMessage() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert("APIキーを入力してください（右上の ☰ → Settings）");
    return;
  }

  const text = userInput.value.trim();
  if (!text || isLoading) return;

  userInput.value = "";
  userInput.dispatchEvent(new Event("input"));
  userInput.style.height = "auto";
  isLoading = true;
  abortController = new AbortController();
  sendBtn.title = "Stop";

  addMessage("user", text);
  chatHistory.push({ role: "user", parts: [{ text }] });
  // Keep last 50 turns (100 entries) to prevent memory/token explosion
  // Always slice to even number to keep user/model pairs intact
  if (chatHistory.length > 100) {
    chatHistory = chatHistory.slice(-100);
    if (chatHistory[0]?.role === "model") chatHistory.shift();
  }

  showTyping();

  try {
    // RAG search (parallel-safe, non-blocking on failure)
    const ragContext = await ragSearch(text);

    const model = modelSelect.value;
    const sysText = getSystemPromptWithMemory() + ragContext;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sysText }] },
          contents: chatHistory,
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
        signal: abortController.signal,
      },
    );

    hideTyping();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errCode = err?.error?.code || response.status;
      const errMsg = err?.error?.message || "";
      let friendly;
      if (
        errCode === 429 ||
        errMsg.includes("quota") ||
        errMsg.includes("rate")
      ) {
        const wait = errMsg.match(/retry in ([\d.]+)s/i);
        friendly = wait
          ? `⏳ API制限に達しました。${Math.ceil(parseFloat(wait[1]))}秒後にもう一度お試しください。`
          : "⏳ API制限に達しました。しばらく待ってからお試しください。";
      } else if (errCode === 400) {
        friendly = "⚠️ リクエストエラー。APIキーが正しいか確認してください。";
      } else if (errCode === 403) {
        friendly =
          "🔑 APIキーが無効です。Google AI Studio で再発行してください。";
      } else if (errCode === 404) {
        friendly =
          "⚠️ 選択中のモデルが利用できません。Settingsから別のモデルをお試しください。";
      } else {
        friendly = `⚠️ エラーが発生しました (${errCode})。しばらく待ってからお試しください。`;
      }
      addMessage("bot", friendly);
      chatHistory.pop();
      return;
    }

    const data = await response.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "(応答なし)";

    addMessage("bot", reply);
    chatHistory.push({ role: "model", parts: [{ text: reply }] });

    // Save history & trigger summary
    try {
      lsSet("history", JSON.stringify(chatHistory.slice(-100)));
    } catch (e) {
      console.warn("localStorage quota exceeded, history not saved");
      addMessage(
        "bot",
        "⚠️ ブラウザの保存容量が上限に達しました。「🗑 履歴クリア」で空きを作ることをお勧めします。",
      );
    }
    summarizeIfNeeded(key);
  } catch (e) {
    hideTyping();
    if (e.name === "AbortError") {
      addMessage("bot", "⏹ キャンセルしました");
    } else {
      addMessage(
        "bot",
        "⚠️ 通信エラー。インターネット接続を確認してください。",
      );
    }
    chatHistory.pop();
  } finally {
    isLoading = false;
    abortController = null;
    sendBtn.textContent = "送信";
    sendBtn.title = "";
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// ===== 音声入力（スマホ向け） =====
const micBtn = document.getElementById("micBtn");
const inputPreview = document.getElementById("inputPreview");
const clearBtn = document.getElementById("clearBtn");
const inputPreviewOverlay = document.getElementById("inputPreviewOverlay");

function updatePreview(text, isInterim = false) {
  userInput.value = text;
  if (!text) {
    inputPreview.textContent = "";
    inputPreview.className = "input-preview";
    inputPreviewOverlay.classList.remove("visible");
  } else if (isInterim) {
    inputPreview.textContent = text;
    inputPreview.className = "input-preview interim";
    inputPreviewOverlay.classList.add("visible");
  } else {
    inputPreview.textContent = text;
    inputPreview.className = "input-preview";
    inputPreviewOverlay.classList.add("visible");
  }
}

if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;

  let listening = false;
  let savedText = "";

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
    } else {
      savedText = userInput.value;
      recognition.start();
    }
  });

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add("listening");
    // textareaを縮めてマイクに集中
    userInput.classList.remove("expanded");
  };

  recognition.onresult = (e) => {
    let interim = "";
    let finals = savedText;
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finals += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    updatePreview(finals + interim, !!interim);
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
    savedText = userInput.value;
    updatePreview(savedText, false);
  };

  recognition.onerror = (e) => {
    listening = false;
    micBtn.classList.remove("listening");
  };

  // クリアボタン
  clearBtn.addEventListener("click", () => {
    savedText = "";
    updatePreview("");
    if (listening) {
      recognition.stop();
      setTimeout(() => recognition.start(), 300);
    }
  });
} else {
  micBtn.style.display = "none";
}
