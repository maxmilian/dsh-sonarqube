import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'

import { SonarQubeClient } from '../src/client.js'
import { apply, Config, inject, name } from '../src/index.js'
import { registerSonarQubeTools } from '../src/tools.js'

const pluginIt = Object.hasOwn(globalThis, 'Bun') ? it.skip : it

describe('DSH plugin entry', () => {
  it('exports the required identity and tools injection', () => {
    expect(name).toBe('dsh-sonarqube')
    expect(inject).toEqual(['tools'])
    expect(Config).toBeDefined()
  })

  it('exposes localized plugin configuration descriptions', () => {
    expect(Config.meta.description).toMatchObject({
      en: 'Read-only SonarQube Community Build integration settings.',
      'zh-TW': 'SonarQube Community Build 唯讀整合設定。',
      'zh-CN': 'SonarQube Community Build 只读集成设置。',
      'ja-JP': 'SonarQube Community Build の読み取り専用連携設定。',
    })
    expect(Config.dict?.token?.meta.description).toMatchObject({
      en: expect.stringContaining('SONARQUBE_TOKEN'),
      'zh-TW': expect.stringContaining('SONARQUBE_TOKEN'),
      'zh-CN': expect.stringContaining('SONARQUBE_TOKEN'),
      'ja-JP': expect.stringContaining('SONARQUBE_TOKEN'),
    })
  })

  pluginIt('registers exactly the six read-only tools', () => {
    const registeredNames: string[] = []
    const register = vi.fn((definition: { name: string }) => {
      registeredNames.push(definition.name)
      return () => undefined
    })
    const ctx = { tools: { register } } as unknown as Context

    apply(ctx, {
      baseUrl: 'https://sonar.example.com',
      token: 'token',
      requestTimeoutMs: 1_000,
      maxResponseBytes: 10_000,
    })

    expect(register).toHaveBeenCalledTimes(6)
    expect(registeredNames).toEqual([
      'sonarqube_system_status',
      'sonarqube_quality_gate',
      'sonarqube_search_issues',
      'sonarqube_search_hotspots',
      'sonarqube_get_hotspot',
      'sonarqube_get_measures',
    ])
  })

  pluginIt('executes and renders every registered read-only tool', async () => {
    const definitions: ToolDefinition[] = []
    const register = vi.fn((definition: ToolDefinition) => {
      definitions.push(definition)
      return () => undefined
    })
    const ctx = { tools: { register } } as unknown as Context
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('{"status":"UP"}', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    const client = new SonarQubeClient(
      {
        baseUrl: 'https://sonar.example.com',
        token: 'token',
        requestTimeoutMs: 1_000,
        maxResponseBytes: 10_000,
      },
      fetchMock,
    )
    registerSonarQubeTools(ctx, client)
    const args = [
      {},
      { project_key: 'project' },
      { project_key: 'project', page: 1, page_size: 10 },
      { project_key: 'project', status: 'TO_REVIEW' },
      { hotspot_key: 'H1' },
      { project_key: 'project', metric_keys: ['coverage'] },
    ]
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext

    for (const [index, definition] of definitions.entries()) {
      const input = args[index]
      if (!input) throw new Error(`Missing tool args at index ${index}`)
      const value = await definition.execute(input, exec)
      expect(definition.output.render(input, value as never)).toEqual([
        { type: 'text', text: JSON.stringify(value) },
      ])
      expect(definition.isConcurrencySafe?.(input)).toBe(true)
    }
  })
})
