# ChatBot Lite 💬

<p align="center">
  <img src="images/mephi.jpg" alt="Mephi - ChatBot Lite mascot" width="400">
</p>

**サーバー不要・$0で動くAIチャットbot。**

HTMLファイルを開くだけ。GitHub Pagesにデプロイするだけ。それで完成。

🔥 **デモ**: https://goodsun.github.io/chatbotlite/
😈 **メフィ（Devil's Advocate）**: https://teddy.bon-soleil.com/mephi/

## 特徴

- 🚀 **サーバー不要** — 静的ファイル3つ（HTML + CSS + JS）+ CDN依存2つ
- 🔑 **BYOK** (Bring Your Own Key) — ユーザーのGemini APIキーで動作
- 💰 **インフラ代$0** — GitHub Pages / ローカルファイル / 任意の静的ホスティング
- 🎭 **カスタマイズ自在** — `soul/` ディレクトリでキャラ・知識・テーマを自由に設定
- 📱 **レスポンシブ** — PC/スマホ対応
- 🔒 **プライバシー** — APIキーはブラウザからGemini APIに直接送信（サーバー不経由）
- 🛡️ **セキュリティ** — CSP、DOMPurify (SRI)、`x-goog-api-key`ヘッダー

## ファイル構成

```
index.html    ← HTML構造（75行）
style.css     ← スタイル
app.js        ← アプリケーションロジック（ESモジュール）
soul/         ← キャラカスタマイズ（オプション）
```

CDN依存:
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSSサニタイズ（SRI付き）
- [marked.js](https://github.com/markedjs/marked) — Markdownレンダリング（SRI付き）

## 使い方

1. `index.html` をブラウザで開く（またはGitHub Pagesにデプロイ）
2. [Google AI Studio](https://aistudio.google.com/apikey) でGemini APIキーを取得
3. ヘッダーにAPIキーを入力（入力時に自動検証されます）
4. 話しかける

## カスタマイズ

⚙️ Settings から：

- **System Prompt**: チャットbotの性格・知識・ルールを定義
- **Model**: Gemini モデルを選択
- **Title**: チャットbot名を変更

### Soul ディレクトリ（推奨）

`soul/` ディレクトリにファイルを置くと、起動時に自動読み込みされます。
読み込みに失敗した場合はチャットエリアにエラー通知が表示されます。

```
soul/
  persona.txt     ← システムプロンプト（キャラ設定）
  knowledge.txt   ← 追加知識（プロンプトに追記される）
  config.json     ← タイトル、モデル、アイコン等
  style.css       ← テーマカスタマイズ（<link>で読み込み）
  memory.txt      ← 初期記憶のシード（「前世の記憶」）
```

**config.json の例:**
```json
{
  "title": "メフィ",
  "icon": "😈",
  "model": "gemini-2.5-flash",
  "avatar": "images/mephi.jpg",
  "welcome": "…何よ、ジロジロ見て。",
  "subtitle": "⚙️ Settings で性格変えられるけど、やったら怒るからね？",
  "botIcon": "images/mephi_icon.png",
  "bustup": "images/mephi_bustup.png"
}
```

> ⚠️ `welcome` と `subtitle` はDOMPurifyでサニタイズされます。使用可能なタグ: `p`, `br`, `strong`, `em`, `a`, `span` 等。`style`属性は除去されます。スタイル調整には `soul/style.css` を使用してください。

**複数キャラ運用（GitHub Pages推奨）:**

キャラごとにリポジトリを作り、GitHub Pagesで公開するのが最もシンプルで安全です。

```
my-mephi/          ← リポジトリ → https://you.github.io/my-mephi/
  index.html
  style.css
  app.js
  soul/config.json  ← メフィ用設定
  soul/persona.txt  ← メフィ用ペルソナ

my-sensei/          ← リポジトリ → https://you.github.io/my-sensei/
  index.html
  style.css
  app.js
  soul/config.json  ← 先生用設定
  soul/persona.txt  ← 先生用ペルソナ
```

リポジトリごとにsoul/とアプリファイルの管理者が一致するため、信頼境界が明確になります。

> 📝 同一オリジン（`you.github.io`）上の複数キャラはlocalStorageが衝突するため、各キーにパスプレフィックスが自動付与されます（例: `cbl_/my-mephi/_history`）。

### 例: 専門知識bot

```
あなたは料理の専門家です。和食・洋食・中華なんでも詳しく、
レシピや調理のコツを丁寧に教えてください。
```

### 例: キャラクターbot

```
あなたは「にゃんこ先生」です。猫のように気まぐれで、
語尾に「にゃ」をつけて話します。でも実はとても博識です。
```

### 例: ドキュメントQ&A

System Promptにドキュメント全文を貼り付ければ、
そのドキュメントについて質問できるQ&Abotになります。

## 技術

- Gemini API (`generateContent`) をブラウザから直接呼び出し
- 会話履歴をメモリ保持（マルチターン対応）
- [marked.js](https://github.com/markedjs/marked) によるMarkdownレンダリング（CDN障害時はプレーンテキストにフォールバック）
- [DOMPurify](https://github.com/cure53/DOMPurify) によるXSSサニタイズ（CDN障害時はHTMLタグ全除去にフォールバック）
- localStorage でAPIキー・設定を保存（オプトイン）
- APIキー入力時の自動バリデーション（`models.list` エンドポイントで検証）

## 注意事項

- Gemini API無料枠にはレート制限があります（gemini-2.5-flash: 20回/分）
- 制限に達すると数秒〜数十秒の待機が必要です
- 詳細: [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)

## セキュリティ

- APIキーはブラウザからGemini APIに直接送信されます（サーバーを経由しません）
- APIキーは `x-goog-api-key` ヘッダーで送信（URLに露出しません）
- CSP: `script-src 'self'`（`unsafe-inline` なし）、`style-src 'self'`（`unsafe-inline` なし）
- キーが漏洩した場合は [Google AI Studio](https://aistudio.google.com/apikey) で即座に再生成できます
- bot応答は [DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズ済み（SRIハッシュで改竄検知）
- 外部リンクには `rel="noopener noreferrer"` を自動付与

### APIキーの保存について

「Remember」チェック時、APIキーは **localStorage** に保存されます（sessionStorageではなく）。

**なぜlocalStorageか:**
- ChatBot Liteは「ファイルを開くだけで動く」が設計思想。タブを閉じるたびにAPIキー再入力では実用に耐えない
- sessionStorageはタブ単位で消えるため、ブックマークして日常的に使うチャットbotには不向き
- localStorage保存はオプトイン（デフォルトOFF + セキュリティモーダルでリスク告知）

**リスクと対策:**
- 同一オリジンのJavaScriptからアクセス可能（XSSや悪意ある拡張機能のリスク）
- 対策: DOMPurifyによるサニタイズ、dangerousなタグ/属性の除去、CSP設定
- Gemini APIキーは無料で即座に再生成可能（漏洩時の被害は限定的）
- **機密性の高い用途ではRememberをOFFにして利用してください**

### APIキーのバリデーション

APIキー入力時に `models.list` エンドポイントへ軽量GETリクエストを送信し、有効性を検証します。

- ✅ 緑ボーダー: キーが有効
- ❌ 赤ボーダー: キーが無効
- ⚠️ 黄ボーダー: ネットワークエラー

この検証はユーザーがAPIキーを入力・変更した時のみ実行されます。

## プロダクション導入時の考慮事項

本プロジェクトはPoCです。実際のサービスに組み込む際は以下を検討してください。

- **HTMLセマンティクス**: `<div>` → `<header>`, `<main>`, `<section>` 等に整理
- **関数分割**: `loadSoul`, `sendMessage` のリファクタリング
- **状態管理**: 散在する`let`変数をAppStateオブジェクトに集約
- **localStorage定数化**: キー名(`cbl_*`)を定数で一元管理
- **ストリーミング対応**: `generateContent` → `streamGenerateContent` で体感速度向上

## ライセンス

MIT

## Author

Made with 🧸 by [goodsun](https://github.com/goodsun) & Teddy
