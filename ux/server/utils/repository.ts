import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EvidenceStatus, LabRole } from '../../shared/types'
import { runCommand } from './command'
import { cached } from './cache'
import { INSTANCE_NAME_PATTERN } from './multipass'

/*
 * Read-only adapters over the non-secret evidence Ansible writes to .build/.
 * Every field is parsed through an allow-list; nothing else in those files
 * (or anywhere under .secrets/) is ever read or returned.
 */

export interface OwnershipManifest {
  readable: boolean
  nodes: Record<string, { role: LabRole, ipv4: string | null, firstSeen: string | null }>
}

export interface ConvergenceStamp {
  readable: boolean
  success: boolean
  finishedAt: string | null
  digest: string | null
  nodes: string[]
}

export interface ReportCheck { id: string, label: string, status: EvidenceStatus, detail: string }

export interface ValidationReport {
  readable: boolean
  generatedAt: string | null
  cluster: ReportCheck[]
  sealChain: ReportCheck[]
}

type UnknownRecord = Record<string, unknown>
const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
const text = (value: unknown, max = 200): string | null => typeof value === 'string' ? value.slice(0, max) : null
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const isoOrNull = (value: unknown): string | null => typeof value === 'string' && ISO.test(value) ? value : null
const ROLES: LabRole[] = ['seal', 'leader', 'follower']
const STATUSES: EvidenceStatus[] = ['pass', 'warn', 'fail', 'unknown']

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

export function parseOwnership(raw: unknown): OwnershipManifest {
  const root = record(raw)
  if (raw === null || root.project !== 'red_pass') return { readable: false, nodes: {} }
  const nodes: OwnershipManifest['nodes'] = {}
  for (const [name, value] of Object.entries(record(root.nodes))) {
    const node = record(value)
    if (!INSTANCE_NAME_PATTERN.test(name) || node.launched_by_ansible !== true) continue
    const role = ROLES.find(item => item === node.role)
    if (!role) continue
    nodes[name] = { role, ipv4: text(node.ipv4, 45), firstSeen: isoOrNull(node.first_seen) }
  }
  return { readable: true, nodes }
}

export function parseConvergence(raw: unknown): ConvergenceStamp {
  const root = record(raw)
  if (raw === null) return { readable: false, success: false, finishedAt: null, digest: null, nodes: [] }
  const digest = typeof root.automation_digest === 'string' && /^[0-9a-f]{64}$/.test(root.automation_digest) ? root.automation_digest : null
  const nodes = Array.isArray(root.nodes) ? root.nodes.filter((item): item is string => typeof item === 'string' && INSTANCE_NAME_PATTERN.test(item)) : []
  return { readable: true, success: root.result === 'success', finishedAt: isoOrNull(root.finished_at), digest, nodes }
}

function parseChecks(value: unknown): ReportCheck[] {
  if (!Array.isArray(value)) return []
  return value.map(record).flatMap((item) => {
    const id = text(item.id, 64)
    const label = text(item.label, 120)
    if (!id || !label) return []
    const status = STATUSES.find(candidate => candidate === item.status) ?? 'unknown'
    return [{ id, label, status, detail: text(item.detail) ?? '' }]
  })
}

export function parseValidation(raw: unknown): ValidationReport {
  const root = record(raw)
  if (raw === null) return { readable: false, generatedAt: null, cluster: [], sealChain: [] }
  return {
    readable: true,
    generatedAt: isoOrNull(root.generated_at),
    cluster: parseChecks(root.cluster),
    sealChain: parseChecks(root.seal_chain),
  }
}

/** "Ansible provisioned" truth rule: unreadable manifest is unknown, never unmanaged. */
export function provisionOwnership(name: string, manifest: Pick<OwnershipManifest, 'readable' | 'nodes'>): 'provisioned' | 'unmanaged' | 'unknown' {
  if (!manifest.readable) return 'unknown'
  return manifest.nodes[name] ? 'provisioned' : 'unmanaged'
}

/** Converged only when the last successful run included the node and its digest matches today's automation. */
export function convergenceState(name: string, stamp: ConvergenceStamp, currentDigest: string | null): 'converged' | 'outdated' | 'never-run' | 'failed' | 'unknown' {
  if (!stamp.readable) return 'never-run'
  if (!stamp.success) return 'failed'
  if (!stamp.digest || !currentDigest) return 'unknown'
  if (!stamp.nodes.includes(name)) return 'never-run'
  return stamp.digest === currentDigest ? 'converged' : 'outdated'
}

export interface RepositoryEvidence {
  manifest: OwnershipManifest
  stamp: ConvergenceStamp
  report: ValidationReport
  currentDigest: string | null
}

export async function loadRepositoryEvidence(repositoryRoot: string): Promise<RepositoryEvidence> {
  return cached('repository-evidence', 5_000, async () => {
    const build = resolve(repositoryRoot, '.build')
    const [manifest, stamp, report, currentDigest] = await Promise.all([
      readJson(resolve(build, 'ownership.json')).then(parseOwnership),
      readJson(resolve(build, 'convergence.json')).then(parseConvergence),
      readJson(resolve(build, 'validation.json')).then(parseValidation),
      // Same algorithm the lab used to stamp the run: one script, two callers.
      runCommand(resolve(repositoryRoot, 'scripts/automation-digest.sh'), [], { cwd: repositoryRoot, timeoutMs: 10_000 })
        .then(({ stdout }) => /^[0-9a-f]{64}$/.test(stdout.trim()) ? stdout.trim() : null)
        .catch(() => null),
    ])
    return { manifest, stamp, report, currentDigest }
  })
}
