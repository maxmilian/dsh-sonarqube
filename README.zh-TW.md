# dsh-sonarqube

[English](README.md) | 繁體中文 | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

`dsh-sonarqube` 是一款免費、開源、唯讀的 DeepSeek Harness plugin，整合 SonarQube
Community Build Web API。它讓 agent 能檢查 Quality Gate、issues、Security Hotspots、
coverage、重複程式碼與其他專案 measures，而不會變更 SonarQube 狀態。

Issue 與 hotspot 結果會在 API 提供資料時加入標準化的 `location` 物件，包含 SonarQube
component key、原始檔案 `filePath`、行號與文字範圍。

## 工具

| 工具 | 用途 |
| --- | --- |
| `sonarqube_system_status` | 讀取 instance 狀態與版本。 |
| `sonarqube_quality_gate` | 讀取專案主分析、branch 或 pull request 的 Quality Gate。 |
| `sonarqube_search_issues` | 依類型、嚴重程度、狀態、branch 或 pull request 搜尋 issues。 |
| `sonarqube_search_hotspots` | 依狀態、branch 或 pull request 搜尋 Security Hotspots。 |
| `sonarqube_get_hotspot` | 讀取單一 Security Hotspot 的完整內容。 |
| `sonarqube_get_measures` | 讀取 coverage、重複程式碼、issue 數量、hotspots 或指定 metrics。 |

所有工具皆為唯讀。v0.1 不會指派、確認、解決、重新開啟或以其他方式修改 issues 或
hotspots。

## 必要條件

- DeepSeek Harness，且 `@deepseek-ai/dsh-tools` API 版本相容
- Node.js 22 或更新版本
- 從 GitHub source 安裝或在本機開發時，需要 Bun 1.3.5 或更新版本
- SonarQube Community Build URL，以及有權存取目標專案的 token

已於 2026-08-24 使用 SonarQube Community Build `26.8.0.126808` 與 SonarScanner CLI
`8.0.1.6346` 進行人工相容性驗證。這不代表與所有 SonarQube 版本皆相容；在 CI 採用前，
請先用自己的 instance 驗證。

實機驗證涵蓋 system status、Quality Gate、含原始檔案與行號映射的 issue 搜尋、預設
measures、空的 Security Hotspot 搜尋結果，以及安全的 hotspot 404 處理。Community Build
`26.8.0.126808` 沒有提供 `SECURITY_HOTSPOT` 規則，因此成功的
`sonarqube_get_hotspot` 回應由 mock API 測試涵蓋，而非該次實機驗證。

## 設定

建議使用環境變數，避免 credential 出現在 profile patch：

```sh
export SONARQUBE_URL='https://sonarqube.example.com'
export SONARQUBE_TOKEN='your-token'
```

Plugin config 的優先順序高於環境變數：

| Config | 環境變數 fallback | 預設值 |
| --- | --- | --- |
| `baseUrl` | `SONARQUBE_URL` | 必填 |
| `token` | `SONARQUBE_TOKEN` | 必填 |
| `requestTimeoutMs` | 無 | `30000` |
| `maxResponseBytes` | 無 | `5242880`（5 MiB） |

請勿將 `token` 寫進 `cordis.patch.yml`。若需覆寫非機密設定，可加入較後面的 profile patch
（後面的 row 會取代該 row 的完整 config）：

```yaml
- id: dsh-sonarqube
  name: dsh-sonarqube
  config:
    baseUrl: 'https://sonarqube.example.com'
    requestTimeoutMs: 30000
    maxResponseBytes: 5242880
```

套件內附的 bundle 會掛載 plugin，但不含 credential：

```yaml
- insert:
    - id: dsh-sonarqube
      name: dsh-sonarqube
```

## 安裝

從未來的 npm release 或本機 tarball 安裝：

```sh
dsh plugin --profile web add dsh-sonarqube
dsh plugin --profile web add ./dsh-sonarqube-0.1.0.tgz
```

從 GitHub source 安裝：

```sh
dsh plugin --profile web add github:maxmilian/dsh-sonarqube#PINNED_COMMIT
```

Git 安裝取得的是 source，而非 `lib`，因此套件包含使用 Bun build 的 `prepare` script。
Profile installer 可能需要明確允許 dependency 的 build script。請先審查 source、固定 commit，
並只在信任它時允許 build。

安裝後請重新啟動選定的 DSH profile。可在不啟動 profile 的情況下檢查組合後的設定：

```sh
dsh --profile web --dump-config
```

## 使用範例

可以向 agent 提出：

```text
Use sonarqube_quality_gate for project acme-api on branch main.
Search open CRITICAL issues in acme-api, 50 per page.
Get coverage and duplicated_lines_density for acme-api.
Show the full Security Hotspot with key AX_example.
```

`branch` 與 `pull_request` 互斥。每頁結果限制為 `1..100`，且 `page × page_size` 必須位於
前 10,000 筆結果內。Measures request 最多接受 20 個 metric keys，每個最長 100 個字元。
未指定 metric 清單時，會查詢：

```text
coverage, duplicated_lines_density, bugs, vulnerabilities, code_smells, security_hotspots
```

## 國際化

Schemastery config 描述支援英文、繁體中文、簡體中文與日文。Locale map 包含 DSH 目前的
`en` 與 `zh` ID，以及常見的地區 ID：`en-US`、`zh-CN`、`zh-TW`、`ja` 與 `ja-JP`。
只有 DSH host 已註冊的 locale 才能被選取；目前 core UI 內建 `en` 與 `zh`。

目前 `@deepseek-ai/dsh-tools` API 對每個 tool 與 parameter 只接受一個提供給模型的
description 字串，因此這些描述維持英文，避免宣稱 DSH 尚無法使用的 runtime localization。
Repository 文件可透過每份 README 頂端的語言連結切換。

## 安全性與錯誤處理

- 使用 `Authorization: Bearer ...`，且絕不回傳或記錄 token。
- 遵循 DSH tool 的 `AbortSignal`、每次請求逾時與最大 response size。
- 將 HTTP 401、403、404、429 與 5xx 回應轉換為安全的結構化錯誤。
- 保留安全的 `Retry-After` 與 `SonarQube-Authentication-Token-Expiration` metadata。
- 錯誤不包含 SonarQube response body。
- v0.1 不支援停用 TLS 驗證或略過 self-signed certificate 檢查。

SonarQube Web API 正逐步轉向 API v2。Endpoints 刻意集中在 `src/client.ts`，而非分散於
tool definitions，讓後續 migration 保持局部化。

## 開發

本專案只使用 Bun：

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test --coverage
bun run build
bun pm pack
```

測試使用 Vitest 與 mocked `fetch`，不依賴真實 SonarQube server。Lines、statements、
functions 與 branches 的 coverage gates 均至少為 80%。

## 授權

MIT
