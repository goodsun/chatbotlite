# ChatBot Lite — Architecture

## Overview

```
┌──────────────────────────────────────────────────────┐
│ Browser (Client)                                      │
│                                                        │
│  index.html + style.css + app.js                       │
│      │                                                 │
│      ├── CDN: DOMPurify (SRI) + marked.js (SRI)        │
│      ├── soul/ (persona, config, style, knowledge)     │
│      ├── System Prompt = persona + knowledge + memory   │
│      ├── Chat History (in-memory + localStorage)        │
│      └── Gemini API (direct, no server)                 │
│                                                        │
│  localStorage (path-scoped):                           │
│    {prefix}_api_key / {prefix}_remember                │
│    {prefix}_history  (会話履歴)                          │
│    {prefix}_memory   (要約記憶)                          │
│    {prefix}_system_prompt / {prefix}_model / {prefix}_title │
└──────────────────────────────────────────────────────┘
           │
           ▼ HTTPS (x-goog-api-key header)
┌──────────────────────┐
│ Gemini API            │
│ generativelanguage.   │
│ googleapis.com        │
└──────────────────────┘
```

**サーバーなし。** ブラウザからGemini APIを直接呼び出す。

## ファイル構成

```
index.html    ← HTML構造（~75行）
style.css     ← 全スタイル
app.js        ← ESモジュール（全ロジック）
soul/         ← キャラカスタマイズ（オプション）
```

CDN依存（両方SRI付き）:
- DOMPurify — XSSサニタイズ
- marked.js — Markdownレンダリング（CDN障害時はプレーンテキストにフォールバック）

## Soul System

`./soul/` ディレクトリに配置したファイルを起動時にfetchで読み込む。
読み込みに失敗した場合（ネットワークエラー）、チャットエリアに通知を表示する。

| ファイル | 用途 | 読み込み方式 | 必須 |
|---|---|---|---|
| `persona.txt` | システムプロンプト（キャラ設定・ルール） | fetch → テキスト | No |
| `knowledge.txt` | 追加知識（プロンプト末尾に追記） | fetch → テキスト | No |
| `memory.txt` | 初期記憶のシード（「前世の記憶」） | fetch → テキスト | No |
| `config.json` | タイトル、アイコン、モデル、アバター等 | fetch → JSON | No |
| `style.css` | テーマカスタマイズ | `<link>` タグ挿入 | No |

すべてオプショナル。soul/が存在しなくてもデフォルト設定で動作する。

### config.json スキーマ

```json
{
  "title": "表示名",
  "icon": "😈",
  "model": "gemini-2.5-flash",
  "avatar": "images/avatar.jpg",
  "welcome": "ウェルカムメッセージ (HTML可・DOMPurify適用)",
  "subtitle": "サブテキスト (HTML可・DOMPurify適用)",
  "botIcon": "images/icon.png",
  "bustup": "images/bustup.png",
  "typingMessage": "考え中…"
}
```

> `welcome` / `subtitle` のHTMLはDOMPurifyでサニタイズされる。`span` (class属性可)、`br`、`strong`、`em`、`a` 等が使用可能。`style`属性は除去される。スタイル調整には `soul/style.css` を使用する。

### 複数キャラ運用

GitHub Pagesで各キャラをリポジトリとして管理する:

```
my-mephi/          → https://you.github.io/my-mephi/
  index.html, style.css, app.js
  soul/config.json, soul/persona.txt

my-sensei/          → https://you.github.io/my-sensei/
  index.html, style.css, app.js
  soul/config.json, soul/persona.txt
```

同一オリジン上でもlocalStorageキーにパスプレフィックスが付与されるため、データ衝突は発生しない。

## localStorage 名前空間

localStorageキーはパスベースのプレフィックスでスコープされる:

```
プレフィックス = 'cbl_' + pathname + '_'

例:
  /my-mephi/  → cbl_/my-mephi/_history
  /my-sensei/ → cbl_/my-sensei/_history
  /mephi/     → cbl_/mephi/_history
```

これにより同一オリジン上の複数キャラが互いのデータを汚染しない。

### キー一覧

| キー | 内容 | 機密度 |
|---|---|---|
| `{prefix}api_key` | Gemini APIキー（難読化） | 🔴 高 (opt-in) |
| `{prefix}remember` | キー保存フラグ | 低 |
| `{prefix}history` | 会話履歴JSON | 🟡 中 |
| `{prefix}memory` | 要約記憶 | 🟡 中 |
| `{prefix}system_prompt` | カスタムプロンプト | 低 |
| `{prefix}model` | 選択モデル | 低 |
| `{prefix}title` | カスタムタイトル | 低 |

## Memory System

### 二層構造

```
┌─────────────────────────────────┐
│ 長期記憶 (Memory)                │  ← localStorage: {prefix}memory
│ 自動要約された会話のエッセンス     │  ← 10ターンごとに更新
│ System Promptに注入される         │
├─────────────────────────────────┤
│ 短期記憶 (History)               │  ← localStorage: {prefix}history
│ 会話の全文ログ (最大50ターン)      │  ← Gemini APIに直接送信
│ UIに吹き出しとして表示            │
└─────────────────────────────────┘
```

### 記憶のライフサイクル

```
1. ユーザーが会話する
   ↓
2. chatHistory に追記 → localStorage
   ↓
3. 10ターンごとに Gemini に要約を依頼
   ↓
4. 要約結果を memory に保存 → localStorage
   ↓
5. 次回のAPI呼び出し時、system prompt に memory を注入
   ↓
6. ブラウザを閉じても memory は残る
   ↓
7. 次回アクセス時、history を復元 + memory を注入
```

## Security Model

### CSP (Content Security Policy)

```
default-src 'none';
script-src  'self' https://cdn.jsdelivr.net;
style-src   'self';
connect-src https://generativelanguage.googleapis.com 'self';
img-src     'self' data: https:;
font-src    'self';
```

`unsafe-inline` なし。インラインスクリプト・インラインスタイルは一切不使用。

### 対策一覧

| 脅威 | 対策 |
|---|---|
| XSS (ユーザー入力) | `textContent` で描画 |
| XSS (bot応答) | marked.js → DOMPurify (SRI) |
| XSS (エラー表示) | `addMessage()` 経由で統一 |
| `javascript:` URL | marked.js renderer + DOMPurify で二重ブロック |
| CSS injection | `style` 属性を全除去、soul/style.css は `<link>` で読み込み |
| APIキーURL露出 | `x-goog-api-key` ヘッダーで送信 |
| APIキー保存 | opt-in + セキュリティモーダル + 難読化 |
| メモリ爆発 | chatHistory 50ターン（100エントリ）上限 |
| CDN障害 | DOMPurify: タグ全除去フォールバック / marked.js: プレーンテキストフォールバック |
| localStorage容量超過 | try-catch + ユーザー通知 |

## API Call Structure

```json
POST /v1beta/models/{model}:generateContent
Headers: { "x-goog-api-key": "{apiKey}" }

{
  "system_instruction": {
    "parts": [{
      "text": "{persona}\n\n{knowledge}\n\n【過去の会話の記憶】\n{memory}"
    }]
  },
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 4096
  }
}
```
