/**
 * dsh-sonarqube — read-only SonarQube Community Build tools for DeepSeek Harness.
 * @module dsh-sonarqube
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { createSonarQubeClient } from './client.js'
import type { SonarQubeConfig } from './config.js'
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
} from './config.js'
import { CONFIG_I18N } from './locales.js'
import { registerSonarQubeTools } from './tools.js'

export {
  createSonarQubeClient,
  DEFAULT_METRIC_KEYS,
  resolveConfig,
  SonarQubeClient,
} from './client.js'
export type { ResolvedSonarQubeConfig, SonarQubeConfig } from './config.js'
export { createHttpError, SonarQubeApiError } from './errors.js'
export type * from './types.js'

/** Stable Cordis plugin name. */
export const name = 'dsh-sonarqube'

/** DSH services required by this plugin. */
export const inject = ['tools']

/** Plugin configuration supplied through Cordis. */
export type Config = SonarQubeConfig

/** Schemastery configuration exposed by the plugin. */
export const Config: Schema<Config> = Schema.object({
  baseUrl: Schema.string(),
  token: Schema.string().role('secret'),
  requestTimeoutMs: Schema.number()
    .step(1)
    .min(1)
    .max(MAX_REQUEST_TIMEOUT_MS)
    .default(DEFAULT_REQUEST_TIMEOUT_MS),
  maxResponseBytes: Schema.number()
    .step(1)
    .min(1)
    .max(MAX_RESPONSE_BYTES)
    .default(DEFAULT_MAX_RESPONSE_BYTES),
}).i18n(CONFIG_I18N)

/** Creates the client and registers all read-only tools. */
export function apply(ctx: Context, config: Config): void {
  const client = createSonarQubeClient(config)
  registerSonarQubeTools(ctx, client)
}
