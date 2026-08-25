import { SonarQubeApiError } from './errors.js'

/** Default per-request timeout in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/** Default maximum successful response body size in bytes. */
export const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

/** Maximum accepted per-request timeout in milliseconds. */
export const MAX_REQUEST_TIMEOUT_MS = 5 * 60_000

/** Maximum accepted successful response body size in bytes. */
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

/** Runtime configuration accepted by the client and plugin. */
export interface SonarQubeConfig {
  /** SonarQube base URL. Falls back to SONARQUBE_URL. */
  readonly baseUrl?: string
  /** SonarQube token. Falls back to SONARQUBE_TOKEN. */
  readonly token?: string
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs?: number
  /** Maximum successful response body size in bytes. */
  readonly maxResponseBytes?: number
}

/** Fully validated runtime configuration. */
export interface ResolvedSonarQubeConfig {
  /** Normalized SonarQube base URL with a trailing slash. */
  readonly baseUrl: string
  /** Non-empty SonarQube token. */
  readonly token: string
  /** Validated per-request timeout in milliseconds. */
  readonly requestTimeoutMs: number
  /** Validated maximum successful response body size in bytes. */
  readonly maxResponseBytes: number
}

/** Resolves plugin config over environment variables and validates safe bounds. */
export function resolveConfig(
  config: SonarQubeConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedSonarQubeConfig {
  return validateResolvedConfig({
    baseUrl: config.baseUrl?.trim() || env.SONARQUBE_URL?.trim() || '',
    token: config.token?.trim() || env.SONARQUBE_TOKEN?.trim() || '',
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxResponseBytes: config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
  })
}

/** Validates and normalizes a fully specified client configuration. */
export function validateResolvedConfig(config: ResolvedSonarQubeConfig): ResolvedSonarQubeConfig {
  if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    throw configError('baseUrl or SONARQUBE_URL is required.')
  }
  if (typeof config.token !== 'string' || !config.token.trim()) {
    throw configError('token or SONARQUBE_TOKEN is required.')
  }
  assertBoundedInteger('requestTimeoutMs', config.requestTimeoutMs, MAX_REQUEST_TIMEOUT_MS)
  assertBoundedInteger('maxResponseBytes', config.maxResponseBytes, MAX_RESPONSE_BYTES)
  return {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl.trim()),
    token: config.token.trim(),
  }
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
  if (url.search || url.hash) {
    throw configError('baseUrl must not include a query string or fragment.')
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
  return url.toString()
}

function assertBoundedInteger(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw configError(`${name} must be an integer between 1 and ${maximum}.`)
  }
}

function configError(message: string): SonarQubeApiError {
  return new SonarQubeApiError(`Invalid SonarQube configuration: ${message}`, {
    code: 'INVALID_CONFIG',
  })
}
