# ChatBot Lite 💬

<p align="center">
  <img src="images/mephi.jpg" alt="Mephi - ChatBot Lite mascot" width="400">
</p>

**HTML1ファイルで動くAIチャットbot。**

サーバー不要。インフラ代$0。HTMLファイルを開くだけで動く。

## 特徴

- 📄 **HTML1ファイル完結** — 外部依存ゼロ、CDNも不要
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
- 基本的なXSSサニタイズ内蔵
- localStorage でAPIキー・設定を保存（オプトイン）

## セキュリティ

- APIキーはブラウザからGemini APIに直接送信されます（サーバーを経由しません）
- ⚠️ APIキーはURLクエリパラメータに含まれるため、ブラウザ履歴やDevToolsに残る可能性があります（Gemini APIの仕様上回避不可）
- キーが漏洩した場合は [Google AI Studio](https://aistudio.google.com/apikey) で即座に再生成できます
- localStorage保存はオプトイン（確認ダイアログ付き）
- bot応答はXSSサニタイズ済み

## ライセンス

MIT

## Author

Made with 🧸 by [goodsun](https://github.com/goodsun) & Teddy
