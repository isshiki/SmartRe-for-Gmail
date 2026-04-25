# AGENTS.md

このリポジトリは、Gmail の返信画面で引用ブロックと返信ヘッダを整形する Chrome 拡張「SmartRe for Gmail」を開発するためのものです。

## 基本方針

- Chrome 拡張は Manifest V3 で実装する。
- 対象サイトは `https://mail.google.com/*` のみ。
- Gmail 固有の処理は `src/content.js` 内でも関数として分離し、将来ほかのメールサービスに広げやすくする。
- Gmail の内部 DOM/CSS クラスに依存するセレクタは、ファイル上部の定数にまとめ、何を指すかコメントを残す。
- コメントや開発者向けドキュメントは日本語でよい。
- リリース前には開発用の `console.log` を整理する。

## 機能仕様の重要点

- `blockquote.gmail_quote` は削除しない。受信側クライアントの引用認識に使われるため、構造を残して見た目だけ調整する。
- 引用ブロックの視覚調整は以下を基本とする。
  - `border-left: none`
  - `margin-left: 0`
  - `padding-left: 0`
- `div.gmail_attr` は Outlook 風の複数行ヘッダへ書き換える。
- 既存ヘッダから日時、送信者名、メールアドレスを抽出する。
- 件名は Gmail 画面の `h2.hP` から取得する。
- 宛先メールアドレスは `chrome.identity.getProfileUserInfo()` で取得する。これには `identity.email` 権限が必要。
- 宛先表示名は Gmail 画面上の Google アカウント表示から推定し、取得できない場合はメールアドレスのみ出力する。
- 取得できなかった項目は、その行を出力しない。

## Gmail DOM 操作の注意

- 返信直後、引用本文は DOM 上の `blockquote.gmail_quote` ではなく、`input[type="hidden"]` の `value` に HTML エスケープされた文字列として保持されることがある。
- `div.ajR` の引用展開ボタンをクリックしてから、引用 DOM の生成を待って整形する。
- 返信ボタン検知、引用展開、DOM 待機は MutationObserver ベースで堅牢に実装する。
- Gmail は内部クラス名が変わりやすいので、セレクタ変更時は実画面で確認する。

## 設定

- 拡張全体の ON/OFF は Chrome の拡張機能管理画面に任せ、ポップアップには重複する全体ON/OFFを置かない。
- ポップアップ UI は引用スタイル調整とヘッダ書き換えの個別ON/OFFを提供する。
- 将来の設定追加に備えて、設定処理は拡張しやすくしておく。
- カスタムフォーマットや詳細オプションは初版の表面には出さない。

## ビルドと検証

- `build.ps1` と `build.bat` で `build/` に必要ファイルを集め、`dist/` に ZIP を作る。
- 開発中は Chrome の `chrome://extensions` で「パッケージ化されていない拡張機能を読み込む」からプロジェクトルートを読み込む。
- `manifest.json` の参照先ファイルが存在しない状態では Chrome への読み込みが失敗するため、`src/content.js`、`src/popup.html`、アイコン作成後に読み込み確認を行う。
- Gmail 上の動作は、実際に返信画面を開き、引用展開後の DOM を確認して検証する。

## 商標とアイコン

- 正式表記は `SmartRe for Gmail™` とする。
- README やストア説明には `Gmail is a trademark of Google LLC.` の帰属表示を入れる。
- Google との提携、推薦、公式提供ではないことを明記する。
- アイコンには Gmail ロゴ、封筒マーク、Google カラーを使わず、独自デザインにする。

## Git 運用

- ユーザーが明示的に依頼した場合は、初回コミットや push まで行う。
- 作業中に既存の未コミット変更を見つけた場合は、ユーザー作業の可能性があるため勝手に戻さない。
- `build/`、`dist/`、ZIP などの生成物は原則コミットしない。
