import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSonarQubeClient,
  DEFAULT_METRIC_KEYS,
  resolveConfig,
  SonarQubeClient,
} from '../src/client.js'
import { SonarQubeApiError } from '../src/errors.js'

type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const BASE_CONFIG = {
  baseUrl: 'https://sonar.example.com/sonarqube',
  token: 'secret-token',
  requestTimeoutMs: 1_000,
  maxResponseBytes: 10_000,
} as const

afterEach(() => {
  vi.useRealTimers()
})

describe('configuration', () => {
  it('prefers plugin config over environment variables', () => {
    const resolved = resolveConfig(
      { baseUrl: 'https://config.example.com/root/', token: 'config-token' },
      { SONARQUBE_URL: 'https://env.example.com', SONARQUBE_TOKEN: 'env-token' },
    )

    expect(resolved).toMatchObject({
      baseUrl: 'https://config.example.com/root/',
      token: 'config-token',
      requestTimeoutMs: 30_000,
      maxResponseBytes: 5 * 1024 * 1024,
    })
  })

  it('falls back to environment variables', () => {
    const env = {
      SONARQUBE_URL: 'https://env.example.com/base',
      SONARQUBE_TOKEN: 'env-token',
    }
    const resolved = resolveConfig({}, env)

    expect(resolved.baseUrl).toBe('https://env.example.com/base/')
    expect(resolved.token).toBe('env-token')
    expect(createSonarQubeClient({}, env, vi.fn())).toBeInstanceOf(SonarQubeClient)
  })

  it.each([
    [{ token: 'token' }, 'baseUrl'],
    [{ baseUrl: 'https://sonar.example.com' }, 'token'],
    [{ baseUrl: 'ftp://sonar.example.com', token: 'token' }, 'HTTP(S)'],
    [{ baseUrl: 'https://user:pass@sonar.example.com', token: 'token' }, 'credentials'],
    [{ baseUrl: 'https://sonar.example.com?q=1', token: 'token' }, 'query'],
    [
      { baseUrl: 'https://sonar.example.com', token: 'token', requestTimeoutMs: 0 },
      'requestTimeoutMs',
    ],
  ])('rejects invalid config %#', (config, expected) => {
    expect(() => resolveConfig(config, {})).toThrow(expected)
  })
})

describe('SonarQubeClient public methods', () => {
  it('gets system status with Bearer auth and safe token-expiration metadata', async () => {
    const fetchMock = jsonFetch(
      { id: 'server', status: 'UP', version: 'community' },
      { 'SonarQube-Authentication-Token-Expiration': '2027-01-01T00:00:00Z' },
    )
    const client = createClient(fetchMock)

    const result = await client.systemStatus()

    expect(result.data.status).toBe('UP')
    expect(result.meta.tokenExpiration).toBe('2027-01-01T00:00:00Z')
    const [input, init] = firstCall(fetchMock)
    expect(String(input)).toBe('https://sonar.example.com/sonarqube/api/system/status')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token')
  })

  it('encodes Quality Gate branch queries without losing a base path', async () => {
    const fetchMock = jsonFetch({ projectStatus: { status: 'OK' } })
    const client = createClient(fetchMock)

    await client.qualityGate({ projectKey: 'org:project one', branch: 'feature/a & b' })

    const url = calledUrl(fetchMock)
    expect(url.pathname).toBe('/sonarqube/api/qualitygates/project_status')
    expect(url.searchParams.get('projectKey')).toBe('org:project one')
    expect(url.searchParams.get('branch')).toBe('feature/a & b')
  })

  it('searches issues with filters, pagination, and normalized source locations', async () => {
    const fetchMock = jsonFetch({
      paging: { pageIndex: 2, pageSize: 25, total: 1 },
      issues: [{ key: 'I1', component: 'project:src/a.ts', line: 8 }],
      components: [{ key: 'project:src/a.ts', path: 'src/a.ts' }],
    })
    const client = createClient(fetchMock)

    const result = await client.searchIssues({
      projectKey: 'project',
      types: ['BUG'],
      severities: ['CRITICAL'],
      statuses: ['OPEN'],
      pullRequest: '42',
      page: 2,
      pageSize: 25,
    })

    const url = calledUrl(fetchMock)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      componentKeys: 'project',
      types: 'BUG',
      severities: 'CRITICAL',
      statuses: 'OPEN',
      pullRequest: '42',
      p: '2',
      ps: '25',
    })
    expect(result.data.issues).toEqual([
      {
        key: 'I1',
        component: 'project:src/a.ts',
        line: 8,
        location: { component: 'project:src/a.ts', filePath: 'src/a.ts', line: 8 },
      },
    ])
  })

  it('searches hotspots and derives line numbers from text ranges', async () => {
    const fetchMock = jsonFetch({
      hotspots: [
        {
          key: 'H1',
          component: 'project:src/security.ts',
          textRange: { startLine: 12, endLine: 13 },
        },
      ],
    })
    const client = createClient(fetchMock)

    const result = await client.searchHotspots({
      projectKey: 'project',
      status: 'TO_REVIEW',
      branch: 'main',
    })

    expect(calledUrl(fetchMock).searchParams.get('status')).toBe('TO_REVIEW')
    expect(result.data.hotspots).toEqual([
      expect.objectContaining({
        location: {
          component: 'project:src/security.ts',
          filePath: 'src/security.ts',
          line: 12,
          textRange: { startLine: 12, endLine: 13 },
        },
      }),
    ])
  })

  it('gets complete hotspot details and adds a source location', async () => {
    const fetchMock = jsonFetch({
      key: 'H1',
      project: { key: 'project', name: 'Project' },
      component: {
        key: 'project:src/security.ts',
        path: 'src/security.ts',
        name: 'security.ts',
      },
      line: 7,
      vulnerabilityProbability: 'HIGH',
    })
    const client = createClient(fetchMock)

    const result = await client.getHotspot('H1')

    expect(calledUrl(fetchMock).searchParams.get('hotspot')).toBe('H1')
    expect(result.data.location).toEqual({
      component: 'project:src/security.ts',
      filePath: 'src/security.ts',
      line: 7,
    })
  })

  it('gets default and caller-selected measures', async () => {
    const fetchMock = jsonFetch({ component: { key: 'project', measures: [] } })
    const client = createClient(fetchMock)

    await client.getMeasures({ projectKey: 'project' })
    expect(calledUrl(fetchMock, 0).searchParams.get('metricKeys')).toBe(
      DEFAULT_METRIC_KEYS.join(','),
    )

    await client.getMeasures({ projectKey: 'project', metricKeys: ['coverage', 'ncloc'] })
    expect(calledUrl(fetchMock, 1).searchParams.get('metricKeys')).toBe('coverage,ncloc')
  })
})

describe('validation and operational bounds', () => {
  it('rejects branch and pull request together', async () => {
    const client = createClient(jsonFetch({}))
    expect(() =>
      client.qualityGate({ projectKey: 'project', branch: 'main', pullRequest: '42' }),
    ).toThrow('mutually exclusive')
  })

  it.each([
    [{ projectKey: 'project', page: 0 }, 'page'],
    [{ projectKey: 'project', page: 10_001 }, 'page'],
    [{ projectKey: 'project', pageSize: 101 }, 'pageSize'],
  ])('enforces pagination bounds %#', async (params, expected) => {
    const client = createClient(jsonFetch({}))
    await expect(client.searchIssues(params)).rejects.toThrow(expected)
  })

  it('limits measure key count and syntax', async () => {
    const client = createClient(jsonFetch({}))
    expect(() =>
      client.getMeasures({
        projectKey: 'project',
        metricKeys: Array.from({ length: 21 }, (_, i) => `m${i}`),
      }),
    ).toThrow('1-20')
    expect(() =>
      client.getMeasures({ projectKey: 'project', metricKeys: ['coverage,bad'] }),
    ).toThrow('letters')
  })

  it('propagates caller cancellation to fetch as a safe error', async () => {
    const fetchMock = vi.fn<MockFetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })
    const client = createClient(fetchMock)
    const controller = new AbortController()

    const request = client.systemStatus(controller.signal)
    controller.abort('caller secret reason')

    await expect(request).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    await expect(request).rejects.not.toThrow('caller secret reason')
  })

  it('enforces request timeout', async () => {
    const fetchMock = vi.fn<MockFetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })
    const client = new SonarQubeClient({ ...BASE_CONFIG, requestTimeoutMs: 5 }, fetchMock)

    const request = client.systemStatus()

    await expect(request).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
  })

  it('rejects responses larger than the configured byte limit', async () => {
    const fetchMock = jsonFetch({ data: 'x'.repeat(100) })
    const client = new SonarQubeClient({ ...BASE_CONFIG, maxResponseBytes: 20 }, fetchMock)

    await expect(client.systemStatus()).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })
})

describe('safe response errors', () => {
  it.each([
    [401, 'AUTHENTICATION_FAILED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVER_ERROR'],
    [503, 'SERVER_ERROR'],
    [418, 'SONARQUBE_HTTP_ERROR'],
  ])('maps HTTP %i to %s without exposing the response body', async (status, code) => {
    const fetchMock = vi.fn<MockFetch>().mockResolvedValue(
      new Response('{"errors":[{"msg":"secret-token"}]}', {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30',
          'SonarQube-Authentication-Token-Expiration': '2027-01-01',
        },
      }),
    )
    const client = createClient(fetchMock)

    const error = await client.systemStatus().catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(SonarQubeApiError)
    expect(error).toMatchObject({ code, status })
    expect(String(error)).not.toContain('secret-token')
  })

  it('drops a suspicious token-expiration header that contains the token', async () => {
    const fetchMock = jsonFetch(
      { status: 'UP' },
      { 'SonarQube-Authentication-Token-Expiration': 'secret-token' },
    )
    const result = await createClient(fetchMock).systemStatus()

    expect(result.meta).toEqual({})
  })

  it('rejects non-JSON, invalid JSON, and non-object JSON responses', async () => {
    const plain = vi
      .fn<MockFetch>()
      .mockResolvedValue(
        new Response('<html>proxy error</html>', { headers: { 'Content-Type': 'text/html' } }),
      )
    await expect(createClient(plain).systemStatus()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })

    const invalid = vi
      .fn<MockFetch>()
      .mockResolvedValue(new Response('{bad', { headers: { 'Content-Type': 'application/json' } }))
    await expect(createClient(invalid).systemStatus()).rejects.toThrow('invalid JSON')

    const array = vi
      .fn<MockFetch>()
      .mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
    await expect(createClient(array).systemStatus()).rejects.toThrow('unexpected JSON')
  })

  it('wraps network errors without relaying their sensitive message', async () => {
    const fetchMock = vi.fn<MockFetch>().mockRejectedValue(new Error('secret-token DNS detail'))

    await expect(createClient(fetchMock).systemStatus()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the SonarQube server.',
    })
  })
})

function createClient(fetchMock: MockFetch): SonarQubeClient {
  return new SonarQubeClient(BASE_CONFIG, fetchMock)
}

function jsonFetch(
  body: object,
  headers: Record<string, string> = {},
): ReturnType<typeof vi.fn<MockFetch>> {
  return vi.fn<MockFetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
    ),
  )
}

function firstCall(fetchMock: ReturnType<typeof vi.fn<MockFetch>>, index = 0) {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`Expected fetch call ${index}`)
  return call
}

function calledUrl(fetchMock: ReturnType<typeof vi.fn<MockFetch>>, index = 0): URL {
  return new URL(String(firstCall(fetchMock, index)[0]))
}
