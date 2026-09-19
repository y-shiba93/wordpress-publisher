# wordpress-publisher

Markdown原稿をWordPressの投稿・固定ページへ反映する、リポジトリ非依存のNode.js CLIです。

次の処理を共通化しています。

- Markdownとfrontmatterの読み書き
- 新規下書き、更新、公開
- 本文画像とアイキャッチ画像の登録・再利用
- WordPress上のカテゴリ・タグ選択肢の取得
- frontmatterのチェック式タクソノミー更新
- 公開済み投稿のローカル取り込みと再編集
- WordPress REST APIまたはSSH＋WP-CLIによる接続
- 呼び出し元固有の検証・タクソノミー解決・公開後処理をアダプターへ分離

## 導入

利用側リポジトリの`packages/wordpress-publisher`へGit submoduleとして追加し、workspace依存関係に`@kuro-shiba/wordpress-publisher`を登録します。Node.js 22以上が必要です。

設定例は[examples/wordpress-publisher.config.json](examples/wordpress-publisher.config.json)を参照してください。相対パスは設定ファイルの配置ディレクトリ基準です。

## 基本操作

```sh
wordpress-publisher sync-taxonomy --all --config wordpress-publisher.config.json
wordpress-publisher new sample-article --title "記事タイトル" --config wordpress-publisher.config.json
wordpress-publisher publish sample-article --config wordpress-publisher.config.json
wordpress-publisher update sample-article --config wordpress-publisher.config.json
wordpress-publisher update sample-article --publish --config wordpress-publisher.config.json
```

`publish`は既定でWordPress下書きを新規作成します。公開は明示的な`--publish`で行います。既存投稿はfrontmatterの`wp_post_id`を使って`update`するため、公開後も同じローカル原稿からリライトできます。

既存のWordPress投稿をローカルへ取り込む場合は次を使います。本文は安全に往復できるよう、WordPressの保存HTMLをそのまま本文へ格納します。

```sh
wordpress-publisher pull --id 123 --config wordpress-publisher.config.json
```

## タグとカテゴリ

`sync-taxonomy --article <slug>`または`--all`は、WordPress上の全選択肢をfrontmatterへ反映します。選択は`checked`で指定します。

```yaml
tags:
  - id: 10
    name: WordPress
    slug: wordpress
    checked: true
  - id: 11
    name: 日記
    slug: diary
    checked: false
```

再同期しても、IDまたはslugが一致する選択済み項目は維持されます。

## 接続方式

REST方式では`WP_USER`と`WP_APP_PASSWORD`を環境変数から読みます。設定の`usernameEnv`、`applicationPasswordEnv`で変数名を変更できます。

SSH方式では設定済みSSHホストへ接続し、非公開の一時ディレクトリへ補助PHPと入力を転送して`wp eval-file`を実行します。一時ファイルは処理後に削除します。秘密情報をリポジトリへ保存しません。

## アダプター

設定の`adapter`へJavaScriptまたはTypeScriptモジュールを指定すると、次の任意フックを利用できます。

- `locateArticle`: 原稿の場所や投稿／固定ページを解決
- `beforePublish`: サイト固有の公開前検証
- `prepareMedia`: サイト固有の画像最適化
- `extendPayload`: 筆者、カテゴリ、タグ、親ページ、メタ情報を追加
- `afterWrite`: frontmatter書き戻し後の台帳更新
- `afterPublish`: 通知、Git反映などの公開後処理

共通パッケージにはサイト固有のマスター、通知、Git運用を含めません。

## 検査

```sh
npm install
npm run check
```
