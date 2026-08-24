# dsh-sonarqube

`dsh-sonarqube` is a free, open-source, read-only DeepSeek Harness plugin for the
SonarQube Community Build Web API. It lets an agent inspect Quality Gates, issues,
Security Hotspots, coverage, duplication, and other project measures without changing
SonarQube state.

Issue and hotspot results include a normalized `location` object with the SonarQube
component key, source `filePath`, line, and text range when the API provides them.

## Tools

| Tool | Purpose |
| --- | --- |
| `sonarqube_system_status` | Read instance status and version. |
| `sonarqube_quality_gate` | Read a project's Quality Gate for the main analysis, a branch, or a pull request. |
| `sonarqube_search_issues` | Search issues by type, severity, status, branch, or pull request. |
| `sonarqube_search_hotspots` | Search Security Hotspots by status, branch, or pull request. |
| `sonarqube_get_hotspot` | Read the complete details for one Security Hotspot. |
| `sonarqube_get_measures` | Read coverage, duplication, issue counts, hotspots, or caller-selected metrics. |

All tools are read-only. Version 0.1 does not assign, confirm, resolve, reopen, or otherwise
modify issues or hotspots.

## Requirements

- DeepSeek Harness with compatible `@deepseek-ai/dsh-tools` APIs
- Node.js 22 or newer
- A SonarQube Community Build URL and a token with access to the requested projects

No specific SonarQube release is claimed as tested. The plugin uses the documented Web API
contracts and mock-based tests; verify it against your own instance before relying on it in CI.

## Configuration

Environment variables are recommended so credentials do not appear in a profile patch:

```sh
export SONARQUBE_URL='https://sonarqube.example.com'
export SONARQUBE_TOKEN='your-token'
```

Plugin config takes precedence over environment variables:

| Config | Environment fallback | Default |
| --- | --- | --- |
| `baseUrl` | `SONARQUBE_URL` | required |
| `token` | `SONARQUBE_TOKEN` | required |
| `requestTimeoutMs` | none | `30000` |
| `maxResponseBytes` | none | `5242880` (5 MiB) |

Do not put `token` in `cordis.patch.yml`. If you need non-secret overrides, add a later profile
patch (later rows replace the row's whole config):

```yaml
- id: dsh-sonarqube
  name: dsh-sonarqube
  config:
    baseUrl: 'https://sonarqube.example.com'
    requestTimeoutMs: 30000
    maxResponseBytes: 5242880
```

The bundle included in this package mounts the plugin without credentials:

```yaml
- insert:
    - id: dsh-sonarqube
      name: dsh-sonarqube
```

## Install

From a future npm release or a local tarball:

```sh
dsh plugin --profile web add dsh-sonarqube
dsh plugin --profile web add ./dsh-sonarqube-0.1.0.tgz
```

From GitHub source:

```sh
dsh plugin --profile web add github:YOUR_ORG/dsh-sonarqube#PINNED_COMMIT
```

Git installs receive source rather than `lib`, so this package includes a `prepare` script that
builds with Bun. The profile installer may require explicit permission to run the dependency's
build script. Review the source, pin a commit, and allow the build only if you trust it.

Restart the selected DSH profile after installation. You can verify the composed layer without
booting it:

```sh
dsh --profile web --dump-config
```

## Examples

Ask the agent:

```text
Use sonarqube_quality_gate for project acme-api on branch main.
Search open CRITICAL issues in acme-api, 50 per page.
Get coverage and duplicated_lines_density for acme-api.
Show the full Security Hotspot with key AX_example.
```

`branch` and `pull_request` are mutually exclusive. Search pagination is bounded to pages
`1..10000` and page sizes `1..100`. A measures request accepts at most 20 metric keys, each at
most 100 characters. With no metric list it requests:

```text
coverage, duplicated_lines_density, bugs, vulnerabilities, code_smells, security_hotspots
```

## Security and error behavior

- Uses `Authorization: Bearer ...` and never returns or logs the token.
- Honors the DSH tool `AbortSignal`, a per-request timeout, and a maximum response size.
- Converts HTTP 401, 403, 404, 429, and 5xx responses into safe structured errors.
- Preserves safe `Retry-After` and `SonarQube-Authentication-Token-Expiration` metadata.
- Does not include SonarQube response bodies in errors.
- Does not support disabling TLS verification or self-signed certificate bypass in v0.1.

SonarQube's Web API is gradually moving toward API v2. Endpoints are intentionally centralized in
`src/client.ts`, not spread across tool definitions, so future migrations stay localized.

## Development

This project uses Bun exclusively:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test --coverage
bun run build
bun pm pack
```

Tests use Vitest with mocked `fetch`; they do not require a live SonarQube server. Coverage gates
for lines, statements, functions, and branches are all set to at least 80%.

## 繁中快速說明

這是一個給 DeepSeek Harness 使用的唯讀 SonarQube Community Build plugin。建議用
`SONARQUBE_URL` 與 `SONARQUBE_TOKEN` 設定連線，避免把 token 寫進
`cordis.patch.yml`。v0.1 只查詢 Quality Gate、issues、Security Hotspots 與 measures，
不會修改 SonarQube 狀態。

## License

MIT
