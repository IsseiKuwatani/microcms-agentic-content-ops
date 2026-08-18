# microcms-agentic-content-ops

This is a GitHub template, not an npm package. The core is dependency-free and supports Node.js 20 or later.

microCMSを使うサイト向けの、SEO・コンテンツ運用を支援する小さなAgentic loopです。
本番サイトのデータをAIに丸投げして公開するものではなく、監査 → 優先順位付け → 下書き提案 → 人間承認、という human-on-the-loop を前提にしています。

## What it does

- microCMS Content APIから記事・ブランド等のレコードを読み取り、欠落フィールド、重複slug、画像alt、危険な画像URL、更新日欠落を監査
- サイトの死活を確認
- 監査結果、サイト戦略、任意の集計済みアナリティクスから次の施策をproposal-onlyで作成
- ローカルのCodex CLIから、最大2件の下書き提案を人間承認待ちで作成
- GitHub Actionsでは読み取り専用の監査だけを定期実行

## Quick start

```powershell
Copy-Item .env.example .env
# .env に SITE_URL、microCMSのサービスドメイン、MICROCMS_READ_API_KEYを設定
npm run audit
npm run agent:input
npm run agent:plan
```

ネットワークを使わずに試す場合は、同梱fixtureを使えます。

```powershell
$env:SITE_URL = "https://example.com"
node scripts/microcms-audit.js --fixture examples/microcms-content.json
node scripts/build-agentic-input.js
node scripts/agentic-plan.js
```

生成物は `content-ops/reports/` と `content-ops/proposals/` に置かれます。実運用のレポート・下書き・GA4スナップショットはGitにコミットしないでください。

## Local Codex loop

Codex CLIをログイン済みの開発端末で実行する場合は、次を使えます。

```powershell
./scripts/run-codex-operator.ps1
```

既定モードはread-onlyです。提案ファイルを書かせる場合だけ、明示的に `-AllowWorkspaceWrite` を付けます。microCMSへの書き込み、デプロイ、GitHub pushはこのリポジトリから行いません。Windowsタスクスケジューラ等で無人実行する場合も、まずは人間が生成物をレビューする運用にしてください。

## Human approval gate

次の情報は、一次情報を確認した人の承認なしに公開しないでください。

- 加盟金、初期投資、ロイヤリティ、収益、回収期間
- 契約条件、募集地域、融資・補助金、法律・安全に関する記述
- ブランド名、ロゴ、公式画像、店舗画像
- 「おすすめ」「儲かる」「最安」等のランキング・断定

このツールはmicroCMSのManagement APIを使わず、Content APIの読み取りに限定しています。公開処理を追加する場合は、別の明示的なopt-in、承認記録、ロールバック手順、書き込み専用の権限分離を設計してください。

## Configuration

The generic adapter recognizes `title/name`, `slug`, `content/description/body`, `updatedAt`, and `publishedAt`. Set the article and franchise endpoint names through environment variables when your microCMS schema differs.

設定例は `.env.example` を参照してください。記事・ブランドのフィールド名はサイトごとに異なるため、監査コードを拡張する場合も汎用的なルールとサイト固有のadapterを分離してください。

集計済みGA4データを使う場合は `GA4_SNAPSHOT_PATH` に、個人情報を含まないJSONを指定します。GA4の認証情報やユーザー単位データはこのリポジトリに置きません。

## GitHub Actions

`.github/workflows/audit.yml` は読み取り専用の監査を実行します。Actions secretsに `SITE_URL`、`MICROCMS_SERVICE_DOMAIN`、`MICROCMS_READ_API_KEY` を設定してください。APIキーはContent APIの読み取り専用にします。

ワークフローはコンテンツを公開せず、リポジトリへ自動pushもしません。失敗した監査結果を人間が確認してから、別の承認済み手順で反映してください。

## Development

```powershell
npm run check
```

Exit codes: `0` means the audit completed without critical findings, `2` means a report was generated with critical findings, and `1` means the audit itself failed. Critical findings still produce a remediation proposal before the job fails.

On macOS/Linux, run the Node scripts directly instead of the PowerShell wrapper. For Codex, check the installed CLI with `codex exec --help` and start with `--sandbox read-only --ignore-user-config --ephemeral`.

MIT License.
