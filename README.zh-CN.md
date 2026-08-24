# dsh-sonarqube

[English](README.md) | [繁體中文](README.zh-TW.md) | 简体中文 | [日本語](README.ja.md)

`dsh-sonarqube` 是一款免费、开源、只读的 DeepSeek Harness plugin，用于集成 SonarQube
Community Build Web API。它让 agent 能够检查 Quality Gate、issues、Security Hotspots、
coverage、重复代码和其他项目 measures，而不会更改 SonarQube 状态。

当 API 提供相关数据时，issue 和 hotspot 结果会加入标准化的 `location` 对象，其中包含
SonarQube component key、源文件 `filePath`、行号和文本范围。

## 工具

| 工具 | 用途 |
| --- | --- |
| `sonarqube_system_status` | 读取 instance 状态和版本。 |
| `sonarqube_quality_gate` | 读取项目主分析、branch 或 pull request 的 Quality Gate。 |
| `sonarqube_search_issues` | 按类型、严重程度、状态、branch 或 pull request 搜索 issues。 |
| `sonarqube_search_hotspots` | 按状态、branch 或 pull request 搜索 Security Hotspots。 |
| `sonarqube_get_hotspot` | 读取单个 Security Hotspot 的完整内容。 |
| `sonarqube_get_measures` | 读取 coverage、重复代码、issue 数量、hotspots 或指定 metrics。 |

所有工具均为只读。v0.1 不会分配、确认、解决、重新打开或以其他方式修改 issues 或
hotspots。

## 要求

- DeepSeek Harness，且 `@deepseek-ai/dsh-tools` API 版本兼容
- Node.js 22 或更高版本
- SonarQube Community Build URL，以及有权访问目标项目的 token

已于 2026-08-24 使用 SonarQube Community Build `26.8.0.126808` 和 SonarScanner CLI
`8.0.1.6346` 进行人工兼容性验证。这不代表与所有 SonarQube 版本均兼容；在 CI 中采用前，
请先使用自己的 instance 验证。

实机验证涵盖 system status、Quality Gate、包含源文件和行号映射的 issue 搜索、默认
measures、空的 Security Hotspot 搜索结果，以及安全的 hotspot 404 处理。Community Build
`26.8.0.126808` 未提供 `SECURITY_HOTSPOT` 规则，因此成功的
`sonarqube_get_hotspot` 响应由 mock API 测试覆盖，而不是该次实机验证。

## 配置

建议使用环境变量，避免 credential 出现在 profile patch 中：

```sh
export SONARQUBE_URL='https://sonarqube.example.com'
export SONARQUBE_TOKEN='your-token'
```

Plugin config 的优先级高于环境变量：

| Config | 环境变量 fallback | 默认值 |
| --- | --- | --- |
| `baseUrl` | `SONARQUBE_URL` | 必填 |
| `token` | `SONARQUBE_TOKEN` | 必填 |
| `requestTimeoutMs` | 无 | `30000` |
| `maxResponseBytes` | 无 | `5242880`（5 MiB） |

请勿将 `token` 写入 `cordis.patch.yml`。如果需要覆盖非敏感设置，可以添加位置更靠后的
profile patch（后面的 row 会替换该 row 的完整 config）：

```yaml
- id: dsh-sonarqube
  name: dsh-sonarqube
  config:
    baseUrl: 'https://sonarqube.example.com'
    requestTimeoutMs: 30000
    maxResponseBytes: 5242880
```

软件包内置的 bundle 会挂载 plugin，但不包含 credential：

```yaml
- insert:
    - id: dsh-sonarqube
      name: dsh-sonarqube
```

## 安装

从未来的 npm release 或本地 tarball 安装：

```sh
dsh plugin --profile web add dsh-sonarqube
dsh plugin --profile web add ./dsh-sonarqube-0.1.0.tgz
```

从 GitHub source 安装：

```sh
dsh plugin --profile web add github:YOUR_ORG/dsh-sonarqube#PINNED_COMMIT
```

Git 安装获取的是 source，而不是 `lib`，因此软件包包含使用 Bun build 的 `prepare` script。
Profile installer 可能要求明确允许 dependency 的 build script。请先审查 source、固定
commit，并且仅在信任它时允许 build。

安装后请重新启动所选 DSH profile。可以在不启动 profile 的情况下检查组合后的配置：

```sh
dsh --profile web --dump-config
```

## 使用示例

可以向 agent 提出：

```text
Use sonarqube_quality_gate for project acme-api on branch main.
Search open CRITICAL issues in acme-api, 50 per page.
Get coverage and duplicated_lines_density for acme-api.
Show the full Security Hotspot with key AX_example.
```

`branch` 和 `pull_request` 互斥。搜索页码限制为 `1..10000`，每页结果限制为
`1..100`。Measures request 最多接受 20 个 metric keys，每个最长 100 个字符。未指定
metric 列表时，将查询：

```text
coverage, duplicated_lines_density, bugs, vulnerabilities, code_smells, security_hotspots
```

## 国际化

Schemastery config 描述支持英语、繁体中文、简体中文和日语。Locale map 包含 DSH 当前的
`en` 和 `zh` ID，以及常见的地区 ID：`en-US`、`zh-CN`、`zh-TW`、`ja` 和 `ja-JP`。
只有 DSH host 已注册的 locale 才能被选择；当前 core UI 内置 `en` 和 `zh`。

当前 `@deepseek-ai/dsh-tools` API 对每个 tool 和 parameter 只接受一个提供给模型的
description 字符串，因此这些描述保持英语，避免声称 DSH 尚无法使用的 runtime
localization。Repository 文档可以通过每份 README 顶部的语言链接切换。

## 安全和错误处理

- 使用 `Authorization: Bearer ...`，并且绝不返回或记录 token。
- 遵循 DSH tool 的 `AbortSignal`、单次请求超时和最大 response size。
- 将 HTTP 401、403、404、429 和 5xx 响应转换为安全的结构化错误。
- 保留安全的 `Retry-After` 和 `SonarQube-Authentication-Token-Expiration` metadata。
- 错误不包含 SonarQube response body。
- v0.1 不支持禁用 TLS 验证或跳过 self-signed certificate 检查。

SonarQube Web API 正逐步转向 API v2。Endpoints 有意集中在 `src/client.ts`，而不是分散在
tool definitions 中，使后续 migration 保持局部化。

## 开发

本项目仅使用 Bun：

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test --coverage
bun run build
bun pm pack
```

测试使用 Vitest 和 mocked `fetch`，不依赖真实 SonarQube server。Lines、statements、
functions 和 branches 的 coverage gates 均至少为 80%。

## 许可证

MIT
