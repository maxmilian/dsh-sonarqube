import { createHttpError, SonarQubeApiError } from './errors.js'
import type {
  AnalysisSelector,
  ApiResult,
  GetMeasuresParams,
  JsonObject,
  JsonValue,
  QualityGateParams,
  ResolvedSonarQubeConfig,
  SearchHotspotsParams,
  SearchIssuesParams,
  SonarQubeConfig,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_TIMEOUT_MS = 5 * 60_000
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024
const MAX_PAGE = 10_000
const MAX_PAGE_SIZE = 100
const MAX_FILTER_VALUES = 20
const MAX_METRIC_KEYS = 20
const MAX_VALUE_LENGTH = 400
const TOKEN_EXPIRATION_HEADER = 'SonarQube-Authentication-Token-Expiration'

/** Default metrics returned by `getMeasures`. */
export const DEFAULT_METRIC_KEYS = [
  'coverage',
  'duplicated_lines_density',
  'bugs',
  'vulnerabilities',
  'code_smells',
  'security_hotspots',
] as const

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface RequestContext {
  readonly controller: AbortController
  readonly dispose: () => void
  readonly didTimeout: () => boolean
}

/** Resolves plugin config over environment variables and validates safe bounds. */
export function resolveConfig(
  config: SonarQubeConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedSonarQubeConfig {
  const baseUrl = config.baseUrl?.trim() || env.SONARQUBE_URL?.trim()
  const token = config.token?.trim() || env.SONARQUBE_TOKEN?.trim()
  if (!baseUrl) throw configError('baseUrl or SONARQUBE_URL is required.')
  if (!token) throw configError('token or SONARQUBE_TOKEN is required.')
  const normalizedUrl = normalizeBaseUrl(baseUrl)
  const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  assertBoundedInteger('requestTimeoutMs', requestTimeoutMs, MAX_TIMEOUT_MS)
  assertBoundedInteger('maxResponseBytes', maxResponseBytes, MAX_RESPONSE_BYTES)
  return { baseUrl: normalizedUrl, token, requestTimeoutMs, maxResponseBytes }
}

/** Read-only HTTP client for the SonarQube Community Build Web API. */
export class SonarQubeClient {
  readonly #config: ResolvedSonarQubeConfig
  readonly #fetch: FetchImplementation

  /** Creates a client from resolved configuration. */
  constructor(config: ResolvedSonarQubeConfig, fetchImplementation: FetchImplementation = fetch) {
    this.#config = { ...config, baseUrl: normalizeBaseUrl(config.baseUrl) }
    this.#fetch = fetchImplementation
  }

  /** Returns the SonarQube instance status and version. */
  systemStatus(signal?: AbortSignal): Promise<ApiResult<JsonObject>> {
    return this.#get('api/system/status', new URLSearchParams(), signal)
  }

  /** Returns the Quality Gate status for a project analysis. */
  qualityGate(params: QualityGateParams, signal?: AbortSignal): Promise<ApiResult<JsonObject>> {
    const query = projectQuery(params)
    return this.#get('api/qualitygates/project_status', query, signal)
  }

  /** Searches issues and adds normalized source locations to findings. */
  async searchIssues(
    params: SearchIssuesParams,
    signal?: AbortSignal,
  ): Promise<ApiResult<JsonObject>> {
    const query = projectQuery(params, 'componentKeys')
    appendList(query, 'types', params.types)
    appendList(query, 'severities', params.severities)
    appendList(query, 'statuses', params.statuses)
    appendPagination(query, params.page, params.pageSize)
    const result = await this.#get('api/issues/search', query, signal)
    return { ...result, data: enrichFindings(result.data, 'issues', params.projectKey) }
  }

  /** Searches Security Hotspots and adds normalized source locations. */
  async searchHotspots(
    params: SearchHotspotsParams,
    signal?: AbortSignal,
  ): Promise<ApiResult<JsonObject>> {
    const query = projectQuery(params)
    appendOptional(query, 'status', params.status)
    appendPagination(query, params.page, params.pageSize)
    const result = await this.#get('api/hotspots/search', query, signal)
    return { ...result, data: enrichFindings(result.data, 'hotspots', params.projectKey) }
  }

  /** Returns full details for one Security Hotspot. */
  async getHotspot(key: string, signal?: AbortSignal): Promise<ApiResult<JsonObject>> {
    assertText('hotspot key', key, 100)
    const result = await this.#get(
      'api/hotspots/show',
      new URLSearchParams({ hotspot: key }),
      signal,
    )
    return { ...result, data: enrichSingleFinding(result.data) }
  }

  /** Returns selected project measures, using common quality metrics by default. */
  getMeasures(params: GetMeasuresParams, signal?: AbortSignal): Promise<ApiResult<JsonObject>> {
    assertText('projectKey', params.projectKey)
    const metrics = params.metricKeys ?? DEFAULT_METRIC_KEYS
    validateMetricKeys(metrics)
    const query = new URLSearchParams({
      component: params.projectKey,
      metricKeys: metrics.join(','),
    })
    return this.#get('api/measures/component', query, signal)
  }

  async #get(
    endpoint: string,
    query: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<ApiResult<JsonObject>> {
    const url = new URL(endpoint, this.#config.baseUrl)
    url.search = query.toString()
    const context = createRequestContext(signal, this.#config.requestTimeoutMs)
    try {
      const response = await this.#fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.#config.token}` },
        method: 'GET',
        signal: context.controller.signal,
      })
      return await this.#readResponse(response)
    } catch (error: unknown) {
      throw normalizeRequestError(error, signal, context, this.#config.requestTimeoutMs)
    } finally {
      context.dispose()
    }
  }

  async #readResponse(response: Response): Promise<ApiResult<JsonObject>> {
    const tokenExpiration = safeHeader(
      response.headers,
      TOKEN_EXPIRATION_HEADER,
      this.#config.token,
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw createHttpError(
        response.status,
        safeHeader(response.headers, 'Retry-After', this.#config.token),
        tokenExpiration,
      )
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/json')) {
      await response.body?.cancel()
      throw new SonarQubeApiError('SonarQube returned a non-JSON response.', {
        code: 'INVALID_RESPONSE',
      })
    }
    const body = await readBoundedBody(response, this.#config.maxResponseBytes)
    return { data: parseJsonObject(body), meta: tokenExpiration ? { tokenExpiration } : {} }
  }
}

/** Creates a client using plugin config over environment variables. */
export function createSonarQubeClient(
  config: SonarQubeConfig = {},
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation: FetchImplementation = fetch,
): SonarQubeClient {
  return new SonarQubeClient(resolveConfig(config, env), fetchImplementation)
}

function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw configError('baseUrl must be a valid HTTP or HTTPS URL.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw configError('baseUrl must be an HTTP(S) URL without embedded credentials.')
  }
  if (url.search || url.hash)
    throw configError('baseUrl must not include a query string or fragment.')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
  return url.toString()
}

function configError(message: string): SonarQubeApiError {
  return new SonarQubeApiError(`Invalid SonarQube configuration: ${message}`, {
    code: 'INVALID_CONFIG',
  })
}

function inputError(message: string): SonarQubeApiError {
  return new SonarQubeApiError(`Invalid SonarQube input: ${message}`, { code: 'INVALID_INPUT' })
}

function assertBoundedInteger(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw configError(`${name} must be an integer between 1 and ${maximum}.`)
  }
}

function assertText(name: string, value: string, maximum = MAX_VALUE_LENGTH): void {
  if (!value.trim() || value.length > maximum) {
    throw inputError(`${name} must contain 1-${maximum} characters.`)
  }
}

function projectQuery(params: QualityGateParams, projectParameter = 'projectKey'): URLSearchParams {
  assertText('projectKey', params.projectKey)
  assertSelector(params)
  const query = new URLSearchParams({ [projectParameter]: params.projectKey })
  appendOptional(query, 'branch', params.branch)
  appendOptional(query, 'pullRequest', params.pullRequest)
  return query
}

function assertSelector(selector: AnalysisSelector): void {
  if (selector.branch !== undefined) assertText('branch', selector.branch)
  if (selector.pullRequest !== undefined) assertText('pullRequest', selector.pullRequest)
  if (selector.branch !== undefined && selector.pullRequest !== undefined) {
    throw inputError('branch and pullRequest are mutually exclusive.')
  }
}

function appendOptional(query: URLSearchParams, key: string, value?: string): void {
  if (value !== undefined) {
    assertText(key, value)
    query.set(key, value)
  }
}

function appendList(query: URLSearchParams, key: string, values?: readonly string[]): void {
  if (values === undefined) return
  if (values.length < 1 || values.length > MAX_FILTER_VALUES) {
    throw inputError(`${key} must contain 1-${MAX_FILTER_VALUES} values.`)
  }
  for (const value of values) assertText(`${key} value`, value, 100)
  query.set(key, values.join(','))
}

function appendPagination(query: URLSearchParams, page = 1, pageSize = 50): void {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    throw inputError(`page must be an integer between 1 and ${MAX_PAGE}.`)
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw inputError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`)
  }
  query.set('p', String(page))
  query.set('ps', String(pageSize))
}

function validateMetricKeys(metricKeys: readonly string[]): void {
  if (metricKeys.length < 1 || metricKeys.length > MAX_METRIC_KEYS) {
    throw inputError(`metricKeys must contain 1-${MAX_METRIC_KEYS} values.`)
  }
  for (const key of metricKeys) {
    if (key.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(key)) {
      throw inputError(
        'each metric key must be 1-100 letters, digits, dots, underscores, or hyphens.',
      )
    }
  }
}

function createRequestContext(signal: AbortSignal | undefined, timeoutMs: number): RequestContext {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = (): void => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  return {
    controller,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

function normalizeRequestError(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  context: RequestContext,
  timeoutMs: number,
): SonarQubeApiError {
  if (error instanceof SonarQubeApiError) return error
  if (context.didTimeout()) {
    return new SonarQubeApiError(`SonarQube request timed out after ${timeoutMs} ms.`, {
      code: 'REQUEST_TIMEOUT',
    })
  }
  if (callerSignal?.aborted) {
    return new SonarQubeApiError('SonarQube request was cancelled.', { code: 'REQUEST_ABORTED' })
  }
  return new SonarQubeApiError('Unable to reach the SonarQube server.', { code: 'NETWORK_ERROR' })
}

function safeHeader(headers: Headers, name: string, token: string): string | undefined {
  const value = headers.get(name)?.trim()
  if (!value || value.length > 128 || value.includes(token)) return undefined
  return value
}

async function readBoundedBody(response: Response, maximum: number): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maximum) throw responseTooLarge(maximum)
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    total += value.byteLength
    if (total > maximum) {
      await reader.cancel()
      throw responseTooLarge(maximum)
    }
    text += decoder.decode(value, { stream: true })
  }
}

function responseTooLarge(maximum: number): SonarQubeApiError {
  return new SonarQubeApiError(
    `SonarQube response exceeded the configured maximum of ${maximum} bytes.`,
    { code: 'RESPONSE_TOO_LARGE' },
  )
}

function parseJsonObject(text: string): JsonObject {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new SonarQubeApiError('SonarQube returned invalid JSON.', { code: 'INVALID_RESPONSE' })
  }
  if (!isJsonObject(value)) {
    throw new SonarQubeApiError('SonarQube returned an unexpected JSON value.', {
      code: 'INVALID_RESPONSE',
    })
  }
  return value
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enrichFindings(data: JsonObject, key: string, projectKey: string): JsonObject {
  const findings = data[key]
  if (!Array.isArray(findings)) return data
  const paths = componentPaths(data.components)
  const enriched = findings.map((finding) => enrichFinding(finding, paths, projectKey))
  return { ...data, [key]: enriched }
}

function componentPaths(value: JsonValue | undefined): ReadonlyMap<string, string> {
  const paths = new Map<string, string>()
  if (!Array.isArray(value)) return paths
  for (const component of value) {
    if (!isJsonObject(component)) continue
    const key = component.key
    const path = component.path
    if (typeof key === 'string' && typeof path === 'string') paths.set(key, path)
  }
  return paths
}

function enrichFinding(
  finding: JsonValue,
  paths: ReadonlyMap<string, string>,
  projectKey: string,
): JsonValue {
  if (!isJsonObject(finding)) return finding
  const component = typeof finding.component === 'string' ? finding.component : undefined
  if (!component) return finding
  const filePath = paths.get(component) ?? component.replace(`${projectKey}:`, '')
  return { ...finding, location: sourceLocation(finding, component, filePath) }
}

function enrichSingleFinding(data: JsonObject): JsonObject {
  const componentValue = data.component
  const component =
    typeof componentValue === 'string' ? componentValue : objectString(componentValue, 'key')
  if (!component) return data
  const projectValue = data.project
  const projectKey =
    typeof projectValue === 'string' ? projectValue : (objectString(projectValue, 'key') ?? '')
  const filePath = objectString(componentValue, 'path') ?? component.replace(`${projectKey}:`, '')
  return { ...data, location: sourceLocation(data, component, filePath) }
}

function objectString(value: JsonValue | undefined, key: string): string | undefined {
  if (!isJsonObject(value)) return undefined
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

function sourceLocation(finding: JsonObject, component: string, filePath: string): JsonObject {
  const location: Record<string, JsonValue> = { component, filePath }
  if (typeof finding.line === 'number') location.line = finding.line
  if (isJsonObject(finding.textRange)) {
    location.textRange = finding.textRange
    if (typeof finding.textRange.startLine === 'number') location.line = finding.textRange.startLine
  }
  return location
}
