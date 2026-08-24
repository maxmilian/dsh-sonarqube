/** Stable error codes produced by the SonarQube client. */
export type SonarQubeErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'REQUEST_ABORTED'
  | 'REQUEST_TIMEOUT'
  | 'RESPONSE_TOO_LARGE'
  | 'SERVER_ERROR'
  | 'SONARQUBE_HTTP_ERROR'

/** Safe structured details for a SonarQube failure. */
export interface SonarQubeApiErrorOptions {
  readonly code: SonarQubeErrorCode
  readonly status?: number
  readonly retryAfter?: string
  readonly tokenExpiration?: string
}

/** Structured API error that never embeds credentials or response bodies. */
export class SonarQubeApiError extends Error {
  readonly code: SonarQubeErrorCode
  readonly status?: number
  readonly retryAfter?: string
  readonly tokenExpiration?: string

  /** Creates a safe SonarQube API error. */
  constructor(message: string, options: SonarQubeApiErrorOptions) {
    super(message)
    this.name = 'SonarQubeApiError'
    this.code = options.code
    this.status = options.status
    this.retryAfter = options.retryAfter
    this.tokenExpiration = options.tokenExpiration
  }

  /** Returns JSON-safe error details suitable for diagnostics. */
  toJSON(): Record<string, number | string | undefined> {
    return {
      name: this.name,
      code: this.code,
      status: this.status,
      retryAfter: this.retryAfter,
      tokenExpiration: this.tokenExpiration,
    }
  }
}

/** Creates a safe error for an unsuccessful HTTP response. */
export function createHttpError(
  status: number,
  retryAfter?: string,
  tokenExpiration?: string,
): SonarQubeApiError {
  const descriptor = describeHttpError(status)
  return new SonarQubeApiError(descriptor.message, {
    code: descriptor.code,
    status,
    retryAfter,
    tokenExpiration,
  })
}

function describeHttpError(status: number): {
  readonly code: SonarQubeErrorCode
  readonly message: string
} {
  if (status === 401) {
    return {
      code: 'AUTHENTICATION_FAILED',
      message: 'SonarQube authentication failed. Check the configured token.',
    }
  }
  if (status === 403) {
    return { code: 'PERMISSION_DENIED', message: 'SonarQube denied access to this resource.' }
  }
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'The requested SonarQube resource was not found.' }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'SonarQube rate limit exceeded. Retry later.' }
  }
  if (status >= 500) {
    return { code: 'SERVER_ERROR', message: `SonarQube server error (HTTP ${status}).` }
  }
  return {
    code: 'SONARQUBE_HTTP_ERROR',
    message: `SonarQube request failed (HTTP ${status}).`,
  }
}
