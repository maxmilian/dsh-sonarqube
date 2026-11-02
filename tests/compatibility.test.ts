import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import semver from 'semver'
import { describe, expect, it } from 'vitest'

/**
 * Guards the manifest contract DSH enforces before it installs or mounts a plugin.
 *
 * `evaluatePluginCompatibility` in `@deepseek-ai/dsh-app-boot` honours the plugin's own
 * `engines.dsh` range and otherwise requires every `@deepseek-ai/dsh*` peer range to match the
 * running dsh version, prereleases included. A plugin checkout cannot read the running version,
 * so this suite applies the same rule to the installed `@deepseek-ai/dsh-tools`, which DSH
 * releases in lockstep with the runtime. A devDependency bump that forgets the matching peer
 * range therefore fails here instead of at `dsh plugin add` or at profile boot.
 */

interface PluginManifest {
  readonly name?: string
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly engines?: Readonly<Record<string, string>>
}

const REQUIRE = createRequire(import.meta.url)
const DSH_PEER_NAME = '@deepseek-ai/dsh'
const DSH_PEER_PREFIX = '@deepseek-ai/dsh-'
const RUNTIME_PACKAGE = '@deepseek-ai/dsh-tools'

const PLUGIN_MANIFEST = readJson<PluginManifest>(
  fileURLToPath(new URL('../package.json', import.meta.url)),
)

describe('plugin manifest compatibility', () => {
  it('declares every peer as an installed devDependency the range accepts', () => {
    const peers = PLUGIN_MANIFEST.peerDependencies ?? {}
    const failures = Object.entries(peers).flatMap(([peerName, range]) => {
      const installed = installedVersion(peerName)
      return semver.satisfies(installed, range, { includePrerelease: true })
        ? []
        : [`${peerName}@${installed} does not satisfy "${range}"`]
    })

    expect(failures).toEqual([])
  })

  it('meets the dsh requirement rule DSH applies before installing or mounting', () => {
    const requirements = dshRequirements(PLUGIN_MANIFEST)
    const runtimeVersion = installedVersion(RUNTIME_PACKAGE)
    const failures = Object.entries(requirements).flatMap(([name, range]) =>
      semver.satisfies(runtimeVersion, range, { includePrerelease: true })
        ? []
        : [`${name} range "${range}" does not match dsh ${runtimeVersion}`],
    )

    expect(failures).toEqual([])
    expect(Object.keys(requirements)).not.toHaveLength(0)
  })
})

/** Reproduces DSH's precedence: `engines.dsh` decides alone, peers apply otherwise. */
function dshRequirements(manifest: PluginManifest): Readonly<Record<string, string>> {
  const enginesDsh = manifest.engines?.dsh
  if (enginesDsh !== undefined) return { 'engines.dsh': enginesDsh }
  const peers = manifest.peerDependencies ?? {}
  return Object.fromEntries(
    Object.entries(peers).filter(
      ([name]) => name === DSH_PEER_NAME || name.startsWith(DSH_PEER_PREFIX),
    ),
  )
}

function installedVersion(packageName: string): string {
  let manifestPath: string
  try {
    manifestPath = REQUIRE.resolve(`${packageName}/package.json`)
  } catch {
    throw new Error(
      `Cannot read ${packageName}'s manifest; declare it as a devDependency so this suite can verify it.`,
    )
  }
  const manifest = readJson<{ version?: unknown }>(manifestPath)
  if (typeof manifest.version !== 'string') {
    throw new Error(`${packageName}'s manifest declares no version.`)
  }
  return manifest.version
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}
