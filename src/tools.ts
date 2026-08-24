import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

import type { SonarQubeClient } from './client.js'
import type { JsonValue } from './types.js'

const ISSUE_TYPES = ['BUG', 'VULNERABILITY', 'CODE_SMELL'] as const
const SEVERITIES = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'] as const
const ISSUE_STATUSES = [
  'OPEN',
  'CONFIRMED',
  'REOPENED',
  'RESOLVED',
  'CLOSED',
  'ACCEPTED',
  'FALSE_POSITIVE',
] as const
const HOTSPOT_STATUSES = ['TO_REVIEW', 'REVIEWED'] as const
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data: { type: 'json', required: true },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: true,
      properties: { tokenExpiration: { type: 'string' } },
    },
  },
} as const

/** Registers all read-only SonarQube tools on a DSH tools service. */
export function registerSonarQubeTools(ctx: Context, client: SonarQubeClient): void {
  registerSystemStatus(ctx, client)
  registerQualityGate(ctx, client)
  registerIssueSearch(ctx, client)
  registerHotspotSearch(ctx, client)
  registerHotspotDetails(ctx, client)
  registerMeasures(ctx, client)
}

function registerSystemStatus(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_system_status',
      description: 'Read the SonarQube instance status and version.',
      parameters: {},
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (_args, exec) => client.systemStatus(exec.signal),
      isConcurrencySafe: () => true,
    }),
  )
}

function registerQualityGate(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_quality_gate',
      description: 'Read a project Quality Gate. branch and pull_request are mutually exclusive.',
      parameters: {
        project_key: { type: 'string', required: true, description: 'SonarQube project key' },
        branch: { type: 'string', description: 'Branch name' },
        pull_request: { type: 'string', description: 'Pull request key' },
      },
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (args, exec) =>
        client.qualityGate(
          { projectKey: args.project_key, branch: args.branch, pullRequest: args.pull_request },
          exec.signal,
        ),
      isConcurrencySafe: () => true,
    }),
  )
}

function registerIssueSearch(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_search_issues',
      description: 'Search read-only SonarQube issues with normalized file and line locations.',
      parameters: issueSearchParameters(),
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (args, exec) =>
        client.searchIssues(
          {
            projectKey: args.project_key,
            types: args.types,
            severities: args.severities,
            statuses: args.statuses,
            branch: args.branch,
            pullRequest: args.pull_request,
            page: args.page,
            pageSize: args.page_size,
          },
          exec.signal,
        ),
      isConcurrencySafe: () => true,
    }),
  )
}

function issueSearchParameters() {
  return {
    project_key: { type: 'string', required: true, description: 'SonarQube project key' },
    types: { type: 'array', items: { type: 'string', enum: ISSUE_TYPES } },
    severities: { type: 'array', items: { type: 'string', enum: SEVERITIES } },
    statuses: { type: 'array', items: { type: 'string', enum: ISSUE_STATUSES } },
    branch: { type: 'string', description: 'Branch name' },
    pull_request: { type: 'string', description: 'Pull request key' },
    page: { type: 'integer', description: 'Page number, 1-10000' },
    page_size: { type: 'integer', description: 'Results per page, 1-100' },
  } as const
}

function registerHotspotSearch(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_search_hotspots',
      description: 'Search read-only Security Hotspots with normalized file and line locations.',
      parameters: {
        project_key: { type: 'string', required: true, description: 'SonarQube project key' },
        status: { type: 'string', enum: HOTSPOT_STATUSES },
        branch: { type: 'string', description: 'Branch name' },
        pull_request: { type: 'string', description: 'Pull request key' },
        page: { type: 'integer', description: 'Page number, 1-10000' },
        page_size: { type: 'integer', description: 'Results per page, 1-100' },
      },
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (args, exec) =>
        client.searchHotspots(
          {
            projectKey: args.project_key,
            status: args.status,
            branch: args.branch,
            pullRequest: args.pull_request,
            page: args.page,
            pageSize: args.page_size,
          },
          exec.signal,
        ),
      isConcurrencySafe: () => true,
    }),
  )
}

function registerHotspotDetails(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_get_hotspot',
      description: 'Read the complete details for one SonarQube Security Hotspot.',
      parameters: {
        hotspot_key: { type: 'string', required: true, description: 'Security Hotspot key' },
      },
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (args, exec) => client.getHotspot(args.hotspot_key, exec.signal),
      isConcurrencySafe: () => true,
    }),
  )
}

function registerMeasures(ctx: Context, client: SonarQubeClient): void {
  ctx.tools.register(
    defineTool({
      name: 'sonarqube_get_measures',
      description: 'Read project coverage, duplication, issue counts, and other selected measures.',
      parameters: {
        project_key: { type: 'string', required: true, description: 'SonarQube project key' },
        metric_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional 1-20 metric keys; common quality metrics are used by default',
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: renderJson },
      execute: (args, exec) =>
        client.getMeasures(
          { projectKey: args.project_key, metricKeys: args.metric_keys },
          exec.signal,
        ),
      isConcurrencySafe: () => true,
    }),
  )
}

function renderJson(_args: unknown, value: JsonValue) {
  return [{ type: 'text' as const, text: JSON.stringify(value) }]
}
