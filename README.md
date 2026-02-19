# ChatBot Lite 💬

<p align="center">
  <img src="images/mephi.jpg" alt="Mephi - ChatBot Lite mascot" width="400">
</p>

**HTML1ファイルで動くAIチャットbot。**

サーバー不要。インフラ代$0。HTMLファイルを開くだけで動く。

## 特徴

- 📄 **HTML1ファイル完結** — 依存はDOMPurify CDNのみ
- 🔑 **BYOK** (Bring Your Own Key) — ユーザーのGemini APIキーで動作
- 💰 **サーバーコスト$0** — クライアント→Gemini API直通
- 🎭 **カスタマイズ自在** — システムプロンプトでキャラ・知識を自由に設定
- 📱 **レスポンシブ** — PC/スマホ対応
- 🔒 **プライバシー** — APIキーはブラウザ外に出ない（サーバーに送信されない）

## 使い方

1. `index.html` をブラウザで開く
2. [Google AI Studio](https://aistudio.google.com/apikey) でGemini APIキーを取得
3. ヘッダーにAPIキーを入力
4. 話しかける

## カスタマイズ

⚙️ Settings から：

- **System Prompt**: チャットbotの性格・知識・ルールを定義
- **Model**: Gemini モデルを選択
- **Title**: チャットbot名を変更

### Soul ディレクトリ（推奨）

`soul/` ディレクトリにファイルを置くと、起動時に自動読み込みされます。

```
soul/
  persona.txt     ← システムプロンプト（キャラ設定）
  knowledge.txt   ← 追加知識（プロンプトに追記される）
  config.json     ← タイトル、モデル、アイコン等
  style.css       ← テーマカスタマイズ
```

**config.json の例:**
```json
{
  "title": "メフィ",
  "icon": "😈",
  "model": "gemini-2.5-flash",
  "avatar": "images/mephi.jpg",
  "welcome": "…何よ、ジロジロ見て。",
  "subtitle": "⚙️ Settings で性格変えられるけど、やったら怒るからね？"
}
```

**複数キャラ運用:**
```
/mephi/index.html  → ../chatbotlite/index.html (シンボリックリンク)
/mephi/soul/        → メフィ用soul

/sensei/index.html → ../chatbotlite/index.html (シンボリックリンク)
/sensei/soul/       → 先生用soul
```

同じ index.html で soul/ だけ変えれば別キャラに。

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
- 軽量Markdownレンダラー内蔵
- [DOMPurify](https://github.com/cure53/DOMPurify) によるXSSサニタイズ
- localStorage でAPIキー・設定を保存（オプトイン）

## 注意事項

- Gemini API無料枠にはレート制限があります（gemini-2.5-flash: 20回/分）
- 制限に達すると数秒〜数十秒の待機が必要です
- 詳細: [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)

## セキュリティ

- APIキーはブラウザからGemini APIに直接送信されます（サーバーを経由しません）
- APIキーは `x-goog-api-key` ヘッダーで送信（URLに露出しません）
- キーが漏洩した場合は [Google AI Studio](https://aistudio.google.com/apikey) で即座に再生成できます
- bot応答は [DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズ済み

### APIキーの保存について

「Remember」チェック時、APIキーは **localStorage** に保存されます（sessionStorageではなく）。

**なぜlocalStorageか:**
- ChatBot Liteは「HTMLを開くだけで動く」が設計思想。タブを閉じるたびにAPIキー再入力では実用に耐えない
- sessionStorageはタブ単位で消えるため、ブックマークして日常的に使うチャットbotには不向き
- localStorage保存はオプトイン（デフォルトOFF + 確認ダイアログでリスク告知）

**リスクと対策:**
- 同一オリジンのJavaScriptからアクセス可能（XSSや悪意ある拡張機能のリスク）
- 対策: DOMPurifyによるサニタイズ、dangerousなタグ/属性の除去、CSP設定推奨
- Gemini APIキーは無料で即座に再生成可能（漏洩時の被害は限定的）
- **機密性の高い用途ではRememberをOFFにして利用してください**

## ライセンス

MIT

## Author

Made with 🧸 by [goodsun](https://github.com/goodsun) & Teddy
