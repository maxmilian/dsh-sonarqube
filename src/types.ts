import type { JsonValue as DshJsonValue } from '@deepseek-ai/dsh-tools'

/** The canonical lossless JSON value accepted by DeepSeek Harness tool output. */
export type JsonValue = DshJsonValue

/** A JSON object with string keys. */
export type JsonObject = { [key: string]: JsonValue }

/** Safe response metadata exposed by the SonarQube client. */
export interface ApiMetadata {
  readonly tokenExpiration?: string
}

/** Canonical response returned by every SonarQube client method. */
export interface ApiResult<T extends JsonValue = JsonObject> {
  readonly data: T
  readonly meta: ApiMetadata
}

/** Runtime configuration accepted by the client and plugin. */
export interface SonarQubeConfig {
  readonly baseUrl?: string
  readonly token?: string
  readonly requestTimeoutMs?: number
  readonly maxResponseBytes?: number
}

/** Fully validated runtime configuration. */
export interface ResolvedSonarQubeConfig {
  readonly baseUrl: string
  readonly token: string
  readonly requestTimeoutMs: number
  readonly maxResponseBytes: number
}

/** Shared branch or pull-request selector. */
export interface AnalysisSelector {
  readonly branch?: string
  readonly pullRequest?: string
}

/** Quality Gate request parameters. */
export interface QualityGateParams extends AnalysisSelector {
  readonly projectKey: string
}

/** Issue search request parameters. */
export interface SearchIssuesParams extends QualityGateParams {
  readonly types?: readonly string[]
  readonly severities?: readonly string[]
  readonly statuses?: readonly string[]
  readonly page?: number
  readonly pageSize?: number
}

/** Security Hotspot search request parameters. */
export interface SearchHotspotsParams extends QualityGateParams {
  readonly status?: string
  readonly page?: number
  readonly pageSize?: number
}

/** Project measures request parameters. */
export interface GetMeasuresParams {
  readonly projectKey: string
  readonly metricKeys?: readonly string[]
}
