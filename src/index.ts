/**
 * dsh-sonarqube — read-only SonarQube Community Build tools for DeepSeek Harness.
 * @module dsh-sonarqube
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { createSonarQubeClient } from './client.js'
import { registerSonarQubeTools } from './tools.js'

export {
  createSonarQubeClient,
  DEFAULT_METRIC_KEYS,
  resolveConfig,
  SonarQubeClient,
} from './client.js'
export { createHttpError, SonarQubeApiError } from './errors.js'
export type * from './types.js'

/** Stable Cordis plugin name. */
export const name = 'dsh-sonarqube'

/** DSH services required by this plugin. */
export const inject = ['tools']

/** Plugin configuration supplied through Cordis. */
export interface Config {
  /** SonarQube base URL. Falls back to SONARQUBE_URL. */
  readonly baseUrl?: string
  /** SonarQube token. Falls back to SONARQUBE_TOKEN. */
  readonly token?: string
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs?: number
  /** Maximum successful response body size in bytes. */
  readonly maxResponseBytes?: number
}

/** Schemastery configuration exposed by the plugin. */
export const Config: Schema<Config> = Schema.object({
  baseUrl: Schema.string(),
  token: Schema.string(),
  requestTimeoutMs: Schema.number().default(30_000),
  maxResponseBytes: Schema.number().default(5 * 1024 * 1024),
})

/** Creates the client and registers all read-only tools. */
export function apply(ctx: Context, config: Config): void {
  const client = createSonarQubeClient(config)
  registerSonarQubeTools(ctx, client)
}
