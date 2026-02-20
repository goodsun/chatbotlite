// --- localStorage namespace (path-scoped to avoid collisions on same-origin hosts like github.io) ---
const LS_PREFIX = 'cbl_' + location.pathname.replace(/\/index\.html$/, '/').replace(/([^/])$/, '$1/') + '_';
function lsGet(key) { return localStorage.getItem(LS_PREFIX + key); }
function lsSet(key, value) { localStorage.setItem(LS_PREFIX + key, value); }
function lsRemove(key) { localStorage.removeItem(LS_PREFIX + key); }

// --- State ---
let chatHistory = [];
let isLoading = false;
let abortController = null;
let memory = lsGet('memory') || '';
let turnsSinceLastSummary = 0;
let soulConfig = {}; // Loaded from soul/config.json
const SUMMARY_INTERVAL = 10; // Summarize every N turns

// --- DOM ---
const apiKeyInput = document.getElementById('apiKey');
const rememberCb = document.getElementById('rememberCb');
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const welcome = document.getElementById('welcome');
const configToggle = document.getElementById('configToggle');
const configPanel = document.getElementById('configPanel');
const systemPrompt = document.getElementById('systemPrompt');
const modelSelect = document.getElementById('modelSelect');
const botTitle = document.getElementById('botTitle');

// --- Key obfuscation (not encryption — just hides from casual DevTools inspection) ---
function obfuscateKey(key) { return btoa(key.split('').reverse().join('')); }
function deobfuscateKey(stored) { try { return atob(stored).split('').reverse().join(''); } catch { return ''; } }

// --- Init ---
const isRemember = lsGet('remember') === '1';
rememberCb.checked = isRemember;
if (isRemember) {
  apiKeyInput.value = deobfuscateKey(lsGet('api_key') || '');
}

// --- Soul loader ---
async function loadSoul() {
  const soulErrors = [];

  // persona.txt → system prompt
  try {
    const res = await fetch('./soul/persona.txt');
    if (res.ok) {
      const text = await res.text();
      if (text.trim()) systemPrompt.value = text.trim();
    }
  } catch(e) { soulErrors.push('persona.txt'); }

  // config.json → model, title, temperature, etc.
  try {
    const res = await fetch('./soul/config.json');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.model) modelSelect.value = cfg.model;
      if (cfg.title) {
        botTitle.value = cfg.title;
        document.querySelector('.header h1').textContent = '😈 ' + cfg.title;
        document.querySelector('.welcome h2').textContent = '😈 ' + cfg.title;
        document.title = cfg.title;
      }
      if (cfg.welcome) {
        const wp = document.querySelector('.welcome p');
        if (wp) wp.innerHTML = sanitize(cfg.welcome);
      }
      if (cfg.icon) {
        document.querySelector('.header h1').textContent = cfg.icon + ' ' + (cfg.title || 'ChatBot Lite');
        document.querySelector('.welcome h2').textContent = cfg.icon + ' ' + (cfg.title || 'ChatBot Lite');
      }
      if (cfg.avatar) {
        const img = document.getElementById('welcomeImg');
        if (img) img.src = cfg.avatar;
      }
      if (cfg.subtitle) {
        const ps = document.querySelectorAll('.welcome p');
        if (ps[1]) ps[1].innerHTML = sanitize(cfg.subtitle);
      }
      // Mascot bust-up
      if (cfg.bustup) {
        const bustup = document.getElementById('mascotBustup');
        bustup.src = cfg.bustup;
        bustup.classList.remove('hidden');
      }
      // Store for sendMessage (scoped, not global)
      soulConfig = cfg;
    }
  } catch(e) { soulErrors.push('config.json'); }

  // memory.txt → initial memory (seed) — only if specified in config
  if (soulConfig.seedMemory) {
    try {
      const res = await fetch(soulConfig.seedMemory);
      if (res.ok) {
        const text = await res.text();
        if (text.trim() && !memory) memory = text.trim();
      }
    } catch(e) { soulErrors.push('memory.txt'); }
  }

  // knowledge.txt → append to system prompt — only if specified in config
  if (soulConfig.knowledge) {
    try {
      const res = await fetch(soulConfig.knowledge);
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) {
          systemPrompt.value += '\n\n【参考知識】\n' + text.trim();
        }
      }
    } catch(e) { soulErrors.push('knowledge.txt'); }
  }

  // style.css → load via <link> (CSP-compatible) — only if specified in config
  if (soulConfig.stylesheet) {
    try {
      const res = await fetch(soulConfig.stylesheet, { method: 'HEAD' });
      if (res.ok) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = soulConfig.stylesheet;
        document.head.appendChild(link);
      }
    } catch(e) { soulErrors.push('style.css'); }
  }

  // Notify user if soul files failed to load (network errors only — 404 is OK)
  if (soulErrors.length > 0) {
    console.warn('Soul files failed to load:', soulErrors);
    const notice = document.createElement('div');
    notice.className = 'msg system';
    notice.textContent = `⚠️ 設定ファイル読み込みエラー: ${soulErrors.join(', ')}（チャット機能は使えます）`;
    chatArea.appendChild(notice);
  }
}

// Load soul, then apply localStorage overrides
await loadSoul();

// No auto-validation on startup — only validate when user interacts with the key field

// Restore chat history from previous session
const savedHistory = lsGet('history');
if (savedHistory) {
  try {
    const parsed = JSON.parse(savedHistory);
    if (Array.isArray(parsed) && parsed.length > 0) {
      chatHistory = parsed;
      // Render previous messages
      welcome.style.display = 'none';
      for (const msg of chatHistory) {
        addMessage(msg.role === 'user' ? 'user' : 'bot', msg.parts[0].text);
      }
      // Show session restore notice
      const notice = document.createElement('div');
      notice.className = 'msg system';
      notice.textContent = '— 前回の会話を復元しました —';
      chatArea.appendChild(notice);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  } catch(e) {}
}

const savedPrompt = lsGet('system_prompt');
if (savedPrompt) systemPrompt.value = savedPrompt;

const savedModel = lsGet('model');
if (savedModel) modelSelect.value = savedModel;

const savedTitle = lsGet('title');
if (savedTitle) {
  botTitle.value = savedTitle;
  document.querySelector('.header h1').textContent = '💬 ' + savedTitle;
  document.querySelector('.welcome h2').textContent = '💬 ' + savedTitle;
  document.title = savedTitle;
}

// --- Events ---
document.getElementById('keyVisBtn').addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

sendBtn.addEventListener('click', () => {
  if (isLoading && abortController) {
    abortController.abort();
  } else {
    sendMessage();
  }
});

const securityModal = document.getElementById('securityModal');
const modalConfirm = document.getElementById('modalConfirm');
const modalCancel = document.getElementById('modalCancel');

function showSecurityModal() {
  return new Promise(resolve => {
    securityModal.classList.add('active');
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === securityModal) { cleanup(); resolve(false); } };
    const cleanup = () => {
      securityModal.classList.remove('active');
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      securityModal.removeEventListener('click', onOverlay);
    };
    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    securityModal.addEventListener('click', onOverlay);
  });
}

rememberCb.addEventListener('change', async () => {
  if (rememberCb.checked) {
    if (!await showSecurityModal()) {
      rememberCb.checked = false;
      return;
    }
    lsSet('remember', '1');
    lsSet('api_key', obfuscateKey(apiKeyInput.value));
  } else {
    lsSet('remember', '0');
    lsRemove('api_key');
  }
});

apiKeyInput.addEventListener('change', () => {
  if (rememberCb.checked) lsSet('api_key', obfuscateKey(apiKeyInput.value));
  validateApiKey();
});

apiKeyInput.addEventListener('blur', () => {
  validateApiKey();
});

// --- API Key Validation ---
let validateTimer = null;
async function validateApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.style.borderColor = '#3a2a5a';
    return;
  }
  // Debounce
  if (validateTimer) clearTimeout(validateTimer);
  validateTimer = setTimeout(async () => {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
        { method: 'GET', headers: { 'x-goog-api-key': key } }
      );
      if (res.ok) {
        apiKeyInput.style.borderColor = '#22c55e';
        apiKeyInput.title = '✅ APIキー有効';
      } else {
        apiKeyInput.style.borderColor = '#ef4444';
        apiKeyInput.title = '❌ APIキーが無効です';
      }
    } catch {
      apiKeyInput.style.borderColor = '#f59e0b';
      apiKeyInput.title = '⚠️ 接続できません';
    }
  }, 500);
}

systemPrompt.addEventListener('change', () => {
  lsSet('system_prompt', systemPrompt.value);
});

modelSelect.addEventListener('change', () => {
  lsSet('model', modelSelect.value);
});

botTitle.addEventListener('change', () => {
  const t = botTitle.value.trim() || 'メフィ';
  const icon = soulConfig.icon || '💬';
  lsSet('title', t);
  document.querySelector('.header h1').textContent = icon + ' ' + t;
  document.querySelector('.welcome h2').textContent = icon + ' ' + t;
  document.title = t;
});

configToggle.addEventListener('click', () => {
  configPanel.classList.toggle('active');
  configToggle.setAttribute('aria-expanded', configPanel.classList.contains('active'));
  // Show memory preview
  const mp = document.getElementById('memoryPreview');
  mp.textContent = memory ? '💭 Memory: ' + memory : '💭 Memory: (empty)';
});

document.getElementById('clearMemory').addEventListener('click', () => {
  if (!confirm('記憶をクリアしますか？')) return;
  memory = '';
  lsRemove('memory');
  document.getElementById('memoryPreview').textContent = '💭 Memory: (empty)';
});

document.getElementById('clearHistory').addEventListener('click', () => {
  if (!confirm('会話履歴をクリアしますか？')) return;
  chatHistory = [];
  lsRemove('history');
  turnsSinceLastSummary = 0;
  // Remove all messages but keep the welcome element
  chatArea.querySelectorAll('.msg, .msg-row, .msg.system').forEach(el => el.remove());
  chatArea.appendChild(welcome);
  welcome.style.display = '';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// --- Markdown (lightweight) ---
// --- Markdown (marked.js with fallback) ---
if (typeof marked !== 'undefined') {
  const markedOpts = {
    breaks: true,
    gfm: true,
    renderer: (() => {
      const r = new marked.Renderer();
      r.link = function({ href, text }) {
        const u = (href || '').toLowerCase().replace(/[\s\u0000-\u001f]/g, '');
        if (u.startsWith('javascript:') || u.startsWith('data:') || u.startsWith('vbscript:')) return text;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      };
      return r;
    })()
  };
  marked.setOptions(markedOpts);
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
  // Fallback: escape HTML and convert newlines to <br>
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// --- Sanitizer (DOMPurify) ---
function sanitize(html) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      ALLOW_DATA_ATTR: false,
    });
  }
  // Fallback: strip all HTML tags if DOMPurify failed to load
  return html.replace(/<[^>]*>/g, '');
}

// --- Memory ---
function getSystemPromptWithMemory() {
  let prompt = systemPrompt.value;
  if (memory) {
    prompt += '\n\n【過去の会話の記憶】\n' + memory;
  }
  return prompt;
}

let isSummarizing = false;
async function summarizeIfNeeded(key) {
  turnsSinceLastSummary++;
  if (turnsSinceLastSummary < SUMMARY_INTERVAL || isSummarizing) return;
  turnsSinceLastSummary = 0;
  isSummarizing = true;
  
  // Build conversation text for summary
  const recentTurns = chatHistory.slice(-20).map(m => 
    `${m.role === 'user' ? 'User' : 'Bot'}: ${m.parts[0].text}`
  ).join('\n');
  
  const prevMemory = memory ? `Previous memory:\n${memory}\n\n` : '';
  
  try {
    const model = modelSelect.value;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 
            `${prevMemory}Recent conversation:\n${recentTurns}\n\nSummarize the key facts, user preferences, and important context from this conversation into a concise memory note (max 500 chars). Write in the same language the user used. Only output the summary, nothing else.`
          }]}],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 }
        })
      }
    );
    if (res.ok) {
      const data = await res.json();
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) {
        memory = summary.trim();
        try { lsSet('memory', memory); }
        catch(e) {
          console.warn('localStorage quota exceeded, memory not saved');
          addMessage('bot', '⚠️ ブラウザの保存容量が上限に達し、記憶を保存できませんでした。「🗑 記憶クリア」または「🗑 履歴クリア」で空きを作ってください。');
        }
      }
    }
  } catch(e) { /* silent fail */ } finally { isSummarizing = false; }
}

// --- Chat ---
function addMessage(role, content) {
  if (welcome) welcome.style.display = 'none';
  
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  
  if (role === 'user') {
    div.textContent = content;
    chatArea.appendChild(div);
  } else {
    div.innerHTML = sanitize(renderMarkdown(content));
    // Wrap bot message with icon if configured
    const iconSrc = soulConfig.botIcon;
    if (iconSrc) {
      const row = document.createElement('div');
      row.className = 'msg-row';
      const icon = document.createElement('img');
      icon.className = 'msg-icon';
      icon.src = iconSrc;
      icon.alt = '';
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
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typing';
  div.textContent = soulConfig.typingMessage || '考え中…';
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

async function sendMessage() {
  const key = apiKeyInput.value.trim();
  if (!key) { alert('はぁ？APIキーも入れないで話しかけてくんの？'); return; }
  
  const text = userInput.value.trim();
  if (!text || isLoading) return;
  
  userInput.value = '';
  userInput.dispatchEvent(new Event('input'));
  userInput.style.height = 'auto';
  isLoading = true;
  abortController = new AbortController();
  sendBtn.textContent = '⏹';
  sendBtn.title = 'Stop';
  
  addMessage('user', text);
  chatHistory.push({ role: 'user', parts: [{ text }] });
  // Keep last 50 turns (100 entries) to prevent memory/token explosion
  // Always slice to even number to keep user/model pairs intact
  if (chatHistory.length > 100) {
    chatHistory = chatHistory.slice(-100);
    if (chatHistory[0]?.role === 'model') chatHistory.shift();
  }
  
  showTyping();
  
  try {
    const model = modelSelect.value;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: getSystemPromptWithMemory() }] },
          contents: chatHistory,
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
        }),
        signal: abortController.signal
      }
    );
    
    hideTyping();
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errCode = err?.error?.code || response.status;
      const errMsg = err?.error?.message || '';
      let friendly;
      if (errCode === 429 || errMsg.includes('quota') || errMsg.includes('rate')) {
        const wait = errMsg.match(/retry in ([\d.]+)s/i);
        friendly = wait
          ? `⏳ API制限に達しました。${Math.ceil(parseFloat(wait[1]))}秒後にもう一度お試しください。`
          : '⏳ API制限に達しました。しばらく待ってからお試しください。';
      } else if (errCode === 400) {
        friendly = '⚠️ リクエストエラー。APIキーが正しいか確認してください。';
      } else if (errCode === 403) {
        friendly = '🔑 APIキーが無効です。Google AI Studio で再発行してください。';
      } else if (errCode === 404) {
        friendly = '⚠️ 選択中のモデルが利用できません。Settingsから別のモデルをお試しください。';
      } else {
        friendly = `⚠️ エラーが発生しました (${errCode})。しばらく待ってからお試しください。`;
      }
      addMessage('bot', friendly);
      chatHistory.pop();
      return;
    }
    
    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(応答なし)';
    
    addMessage('bot', reply);
    chatHistory.push({ role: 'model', parts: [{ text: reply }] });
    
    // Save history & trigger summary
    try { lsSet('history', JSON.stringify(chatHistory.slice(-100))); }
    catch(e) {
      console.warn('localStorage quota exceeded, history not saved');
      addMessage('bot', '⚠️ ブラウザの保存容量が上限に達しました。「🗑 履歴クリア」で空きを作ることをお勧めします。');
    }
    summarizeIfNeeded(key);
    
  } catch (e) {
    hideTyping();
    if (e.name === 'AbortError') {
      addMessage('bot', '⏹ キャンセルしました');
    } else {
      addMessage('bot', '⚠️ 通信エラー。インターネット接続を確認してください。');
    }
    chatHistory.pop();
  } finally {
    isLoading = false;
    abortController = null;
    sendBtn.textContent = '送信';
    sendBtn.title = '';
    sendBtn.disabled = false;
    userInput.focus();
  }
}
