interface ConfigLocaleMessages {
  readonly $description: string
  readonly baseUrl: string
  readonly token: string
  readonly requestTimeoutMs: string
  readonly maxResponseBytes: string
}

const ENGLISH_CONFIG = {
  $description: 'Read-only SonarQube Community Build integration settings.',
  baseUrl: 'SonarQube base URL. Falls back to SONARQUBE_URL.',
  token: 'SonarQube API token. Prefer the SONARQUBE_TOKEN environment variable.',
  requestTimeoutMs: 'Request timeout in milliseconds.',
  maxResponseBytes: 'Maximum successful response body size in bytes.',
} as const satisfies ConfigLocaleMessages

const TRADITIONAL_CHINESE_CONFIG = {
  $description: 'SonarQube Community Build 唯讀整合設定。',
  baseUrl: 'SonarQube 基底網址；未設定時讀取 SONARQUBE_URL。',
  token: 'SonarQube API token；建議使用 SONARQUBE_TOKEN 環境變數。',
  requestTimeoutMs: '請求逾時時間（毫秒）。',
  maxResponseBytes: '成功回應內容的大小上限（位元組）。',
} as const satisfies ConfigLocaleMessages

const SIMPLIFIED_CHINESE_CONFIG = {
  $description: 'SonarQube Community Build 只读集成设置。',
  baseUrl: 'SonarQube 基础 URL；未设置时读取 SONARQUBE_URL。',
  token: 'SonarQube API token；建议使用 SONARQUBE_TOKEN 环境变量。',
  requestTimeoutMs: '请求超时时间（毫秒）。',
  maxResponseBytes: '成功响应内容的大小上限（字节）。',
} as const satisfies ConfigLocaleMessages

const JAPANESE_CONFIG = {
  $description: 'SonarQube Community Build の読み取り専用連携設定。',
  baseUrl: 'SonarQube のベース URL。未設定の場合は SONARQUBE_URL を使用します。',
  token: 'SonarQube API token。SONARQUBE_TOKEN 環境変数の使用を推奨します。',
  requestTimeoutMs: 'リクエストのタイムアウト時間（ミリ秒）。',
  maxResponseBytes: '成功レスポンス本文の最大サイズ（バイト）。',
} as const satisfies ConfigLocaleMessages

/** Localized descriptions consumed by the Schemastery configuration schema. */
export const CONFIG_I18N = {
  en: ENGLISH_CONFIG,
  'en-US': ENGLISH_CONFIG,
  zh: SIMPLIFIED_CHINESE_CONFIG,
  'zh-CN': SIMPLIFIED_CHINESE_CONFIG,
  'zh-TW': TRADITIONAL_CHINESE_CONFIG,
  ja: JAPANESE_CONFIG,
  'ja-JP': JAPANESE_CONFIG,
} as const satisfies Record<string, ConfigLocaleMessages>
