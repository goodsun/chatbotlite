# ChatBot Lite — Architecture

## Overview

```
┌──────────────────────────────────────────────────┐
│ Browser (Client)                                  │
│                                                    │
│  index.html ←── soul/ (persona, config, style)    │
│      │                                             │
│      ├── System Prompt = persona + knowledge + memory
│      ├── Chat History (in-memory + localStorage)   │
│      └── Gemini API (direct, no server)            │
│                                                    │
│  localStorage:                                     │
│    cbl_api_key / cbl_remember                      │
│    cbl_history  (会話履歴)                          │
│    cbl_memory   (要約記憶)                          │
│    cbl_system_prompt / cbl_model / cbl_title       │
└──────────────────────────────────────────────────┘
           │
           ▼ HTTPS (direct)
┌──────────────────────┐
│ Gemini API            │
│ generativelanguage.   │
│ googleapis.com        │
└──────────────────────┘
```

**サーバーなし。** ブラウザからGemini APIを直接呼び出す。

## Soul System

`./soul/` ディレクトリに配置したファイルを起動時にfetchで読み込む。

| ファイル | 用途 | 必須 |
|---|---|---|
| `persona.txt` | システムプロンプト（キャラ設定・ルール） | No |
| `knowledge.txt` | 追加知識（プロンプト末尾に追記） | No |
| `memory.txt` | 初期記憶のシード（「前世の記憶」） | No |
| `config.json` | タイトル、アイコン、モデル、アバター等 | No |
| `style.css` | テーマカスタマイズ（CSSオーバーライド） | No |

すべてオプショナル。soul/が存在しなくてもデフォルト設定で動作する。

### config.json スキーマ

```json
{
  "title": "表示名",
  "icon": "😈",
  "model": "gemini-2.5-flash",
  "avatar": "images/avatar.jpg",
  "welcome": "ウェルカムメッセージ (HTML可)",
  "subtitle": "サブテキスト (HTML可)"
}
```

### 複数キャラ運用

同じindex.htmlをシンボリックリンクで共有し、soul/だけ変える:

```
/mephi/
  index.html → ../../chatbotlite/index.html
  soul/persona.txt  (メフィのペルソナ)
  soul/config.json  (メフィの設定)

/sensei/
  index.html → ../../chatbotlite/index.html
  soul/persona.txt  (先生のペルソナ)
  soul/config.json  (先生の設定)
```

## Memory System

### 二層構造

```
┌─────────────────────────────────┐
│ 長期記憶 (Memory)                │  ← localStorage: cbl_memory
│ 自動要約された会話のエッセンス     │  ← 10ターンごとに更新
│ System Promptに注入される         │
├─────────────────────────────────┤
│ 短期記憶 (History)               │  ← localStorage: cbl_history
│ 会話の全文ログ (最大50ターン)      │  ← Gemini APIに直接送信
│ UIに吹き出しとして表示            │
└─────────────────────────────────┘
```

| | 短期記憶 (History) | 長期記憶 (Memory) |
|---|---|---|
| 保存先 | `cbl_history` | `cbl_memory` |
| 内容 | 会話全文 | 要約 |
| 上限 | 50ターン (100エントリ) | ~500文字 |
| 更新タイミング | 毎メッセージ | 10ターンごと |
| API送信 | contents[] として送信 | system_instruction に追記 |
| クリア | 🗑 履歴クリア | 🗑 記憶クリア |

### 記憶のライフサイクル

```
1. ユーザーが会話する
   ↓
2. chatHistory に追記 → localStorage (cbl_history)
   ↓
3. 10ターンごとに Gemini に要約を依頼
   ↓
4. 要約結果を memory に保存 → localStorage (cbl_memory)
   ↓
5. 次回のAPI呼び出し時、system prompt に memory を注入
   ↓
6. ブラウザを閉じても memory は残る
   ↓
7. 次回アクセス時、history を復元 + memory を注入
```

### soul/memory.txt（シード記憶）

初回起動時に読み込まれる「前世の記憶」。localStorageにmemoryがまだない時のみ適用される。

用途例:
- 「このユーザーはエンジニアです」
- 「前回のプロジェクトでReactを使いました」
- キャラクターの前提知識

## Security Model

### 攻撃対象面 (Attack Surface)

```
┌─────────────┐     HTTPS      ┌──────────┐
│ Browser     │ ──────────────→ │ Gemini   │
│ (index.html)│                 │ API      │
└─────────────┘                 └──────────┘
      │
      └── localStorage (API key, memory, history)
```

**サーバーがないため:**
- サーバーサイドの脆弱性: **N/A**
- 認証情報の中間者リスク: **N/A**（ブラウザ→API直通）
- データベース漏洩: **N/A**

### 対策一覧

| 脅威 | 対策 |
|---|---|
| XSS (ユーザー入力) | `textContent` で描画 |
| XSS (bot応答) | `renderMarkdown` → `sanitize` (危険タグ・属性除去) |
| XSS (エラー表示) | `textContent` で描画 |
| `javascript:` URL | markdown生成 + sanitizer で二重ブロック |
| CSS injection | `style` 属性を全除去 |
| 危険HTML要素 | script/iframe/svg/math/form等をブロック |
| イベントハンドラ | `on*` 属性を全除去 |
| メモリ爆発 | chatHistory 100エントリ上限 |
| APIキー保存 | opt-in + confirm警告 |
| APIキーURL露出 | Gemini API仕様（受容リスク、READMEに明記） |

### localStorage キー一覧

| キー | 内容 | 機密度 |
|---|---|---|
| `cbl_api_key` | Gemini APIキー | 🔴 高 (opt-in) |
| `cbl_remember` | キー保存フラグ | 低 |
| `cbl_history` | 会話履歴JSON | 🟡 中 |
| `cbl_memory` | 要約記憶 | 🟡 中 |
| `cbl_system_prompt` | カスタムプロンプト | 低 |
| `cbl_model` | 選択モデル | 低 |
| `cbl_title` | カスタムタイトル | 低 |

## API Call Structure

```json
POST /v1beta/models/{model}:generateContent?key={apiKey}

{
  "system_instruction": {
    "parts": [{
      "text": "{persona}\n\n{knowledge}\n\n【過去の会話の記憶】\n{memory}"
    }]
  },
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] },
    ...
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 4096
  }
}
```
