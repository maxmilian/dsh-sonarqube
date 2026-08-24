# dsh-sonarqube

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | 日本語

`dsh-sonarqube` は、SonarQube Community Build Web API と連携する、無料かつオープン
ソースの読み取り専用 DeepSeek Harness plugin です。SonarQube の状態を変更せずに、agent
が Quality Gate、issues、Security Hotspots、coverage、重複コード、その他のプロジェクト
measures を確認できます。

API から情報が提供される場合、issue と hotspot の結果には正規化された `location`
オブジェクトが追加されます。このオブジェクトには SonarQube component key、ソースの
`filePath`、行番号、テキスト範囲が含まれます。

## ツール

| ツール | 用途 |
| --- | --- |
| `sonarqube_system_status` | instance の状態とバージョンを取得します。 |
| `sonarqube_quality_gate` | プロジェクトのメイン解析、branch、または pull request の Quality Gate を取得します。 |
| `sonarqube_search_issues` | 種類、severity、状態、branch、または pull request で issues を検索します。 |
| `sonarqube_search_hotspots` | 状態、branch、または pull request で Security Hotspots を検索します。 |
| `sonarqube_get_hotspot` | 1 件の Security Hotspot の完全な詳細を取得します。 |
| `sonarqube_get_measures` | coverage、重複、issue 数、hotspots、または指定した metrics を取得します。 |

すべてのツールは読み取り専用です。v0.1 は issues や hotspots の割り当て、確認、解決、
再オープン、その他の変更を行いません。

## 必要条件

- 互換性のある `@deepseek-ai/dsh-tools` API を備えた DeepSeek Harness
- Node.js 22 以降
- GitHub source からのインストールまたはローカル開発には Bun 1.3.5 以降
- SonarQube Community Build の URL と、対象プロジェクトへのアクセス権を持つ token

2026-08-24 に SonarQube Community Build `26.8.0.126808` と SonarScanner CLI
`8.0.1.6346` を使用して手動で互換性を検証しました。すべての SonarQube リリースとの
互換性を意味するものではありません。CI で利用する前に、ご自身の instance で検証して
ください。

実機検証では system status、Quality Gate、ソースファイルと行番号のマッピングを含む
issue 検索、デフォルト measures、空の Security Hotspot 検索結果、安全な hotspot 404
処理を確認しました。Community Build `26.8.0.126808` には `SECURITY_HOTSPOT` ルールが
存在しなかったため、成功する `sonarqube_get_hotspot` レスポンスは、その実機検証では
なく mock API テストでカバーしています。

## 設定

credential が profile patch に含まれないよう、環境変数の使用を推奨します。

```sh
export SONARQUBE_URL='https://sonarqube.example.com'
export SONARQUBE_TOKEN='your-token'
```

Plugin config は環境変数より優先されます。

| Config | 環境変数 fallback | デフォルト |
| --- | --- | --- |
| `baseUrl` | `SONARQUBE_URL` | 必須 |
| `token` | `SONARQUBE_TOKEN` | 必須 |
| `requestTimeoutMs` | なし | `30000` |
| `maxResponseBytes` | なし | `5242880`（5 MiB） |

`token` を `cordis.patch.yml` に記述しないでください。機密ではない設定を上書きする場合は、
後方に profile patch を追加します（後方の row は、その row の config 全体を置き換えます）。

```yaml
- id: dsh-sonarqube
  name: dsh-sonarqube
  config:
    baseUrl: 'https://sonarqube.example.com'
    requestTimeoutMs: 30000
    maxResponseBytes: 5242880
```

パッケージ付属の bundle は、credential を含めずに plugin をマウントします。

```yaml
- insert:
    - id: dsh-sonarqube
      name: dsh-sonarqube
```

## インストール

将来の npm release またはローカル tarball からインストールします。

```sh
dsh plugin --profile web add dsh-sonarqube
dsh plugin --profile web add ./dsh-sonarqube-0.1.0.tgz
```

GitHub source からインストールします。

```sh
dsh plugin --profile web add github:maxmilian/dsh-sonarqube#PINNED_COMMIT
```

Git からのインストールでは `lib` ではなく source を取得するため、このパッケージには Bun
で build する `prepare` script が含まれます。Profile installer では dependency の build
script を明示的に許可する必要がある場合があります。source を確認して commit を固定し、
信頼できる場合にのみ build を許可してください。

インストール後、選択した DSH profile を再起動してください。profile を起動せずに、合成後の
設定を確認できます。

```sh
dsh --profile web --dump-config
```

## 使用例

agent への依頼例：

```text
Use sonarqube_quality_gate for project acme-api on branch main.
Search open CRITICAL issues in acme-api, 50 per page.
Get coverage and duplicated_lines_density for acme-api.
Show the full Security Hotspot with key AX_example.
```

`branch` と `pull_request` は同時に指定できません。1 ページの結果数は `1..100` に制限され、
`page × page_size` は最初の 10,000 件の範囲内である必要があります。Measures request は最大
20 個の metric keys を受け付け、各 key は最大 100 文字です。metric リストを省略すると、
次の項目を取得します。

```text
coverage, duplicated_lines_density, bugs, vulnerabilities, code_smells, security_hotspots
```

## 国際化

Schemastery config の説明は、英語、繁体字中国語、簡体字中国語、日本語に対応しています。
Locale map には DSH の現在の `en` と `zh` ID に加え、一般的な地域 ID である `en-US`、
`zh-CN`、`zh-TW`、`ja`、`ja-JP` が含まれます。DSH host に登録されている locale のみ
選択できます。現在の core UI に組み込まれているのは `en` と `zh` です。

現在の `@deepseek-ai/dsh-tools` API は、tool と parameter ごとにモデル向け description
文字列を 1 つだけ受け付けるため、これらの説明は英語のままです。DSH がまだ利用できない
runtime localization をサポートしているとは表明しません。Repository のドキュメントは、
各 README 上部の言語リンクで切り替えられます。

## セキュリティとエラー処理

- `Authorization: Bearer ...` を使用し、token を返したりログに記録したりしません。
- DSH tool の `AbortSignal`、リクエストごとの timeout、最大 response size に従います。
- HTTP 401、403、404、429、5xx レスポンスを安全な構造化エラーに変換します。
- 安全な `Retry-After` と `SonarQube-Authentication-Token-Expiration` metadata を保持します。
- エラーには SonarQube response body を含めません。
- v0.1 は TLS 検証の無効化や self-signed certificate のバイパスに対応しません。

SonarQube Web API は段階的に API v2 へ移行しています。将来の migration を局所化するため、
endpoints は tool definitions に分散させず、意図的に `src/client.ts` に集約しています。

## 開発

このプロジェクトは Bun のみを使用します。

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test --coverage
bun run build
bun pm pack
```

テストでは Vitest と mocked `fetch` を使用し、実際の SonarQube server には依存しません。
Lines、statements、functions、branches の coverage gates はすべて 80% 以上です。

## ライセンス

MIT
