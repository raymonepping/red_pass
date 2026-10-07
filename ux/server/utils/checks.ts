import { isIP } from 'node:net'
import type { EvidenceCheck, LabRole } from '../../shared/types'
import { runCommand } from './command'
import { cached } from './cache'
import type { ReportCheck, ValidationReport } from './repository'

const observedAt = () => new Date().toISOString()
const check = (id: string, label: string, status: EvidenceCheck['status'], source: EvidenceCheck['source'], detail: string, scope: EvidenceCheck['scope'] = 'node', at = observedAt()): EvidenceCheck => ({ id, label, status, source, detail, scope, observedAt: at })

/** Validation evidence older than this is shown as stale ("warn"), not trusted as current. */
export const REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Fixed, read-only guest probe. Only the two URLs are passed as positional
// arguments; both are built server-side from a validated IP address.
const NODE_PROBE = String.raw`
release="$(cat /etc/redhat-release 2>/dev/null || true)"
architecture="$(uname -m 2>/dev/null || true)"
selinux="$(getenforce 2>/dev/null || true)"
if [ -z "$(swapon --show --noheadings 2>/dev/null)" ]; then swap=disabled; else swap=active; fi
firewall="$(systemctl is-active firewalld 2>/dev/null || true)"
failed_services="$(systemctl --failed --no-legend --plain 2>/dev/null | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
root_fs="$(df -B1 --output=size,pcent / 2>/dev/null | tail -n 1 | tr -s ' ' | sed 's/^ //' || true)"
vault_service="$(systemctl is-active vault 2>/dev/null || true)"
vault_health="$(curl --silent --max-time 4 --cacert /opt/vault/tls/ca.crt "$1" 2>/dev/null | tr -d '\n' || true)"
vault_seal="$(curl --silent --max-time 4 --cacert /opt/vault/tls/ca.crt "$2" 2>/dev/null | tr -d '\n' || true)"
printf 'release=%s\narchitecture=%s\nselinux=%s\nswap=%s\nfirewall=%s\nfailed_services=%s\nroot_fs=%s\nvault_service=%s\nvault_health=%s\nvault_seal=%s\n' "$release" "$architecture" "$selinux" "$swap" "$firewall" "$failed_services" "$root_fs" "$vault_service" "$vault_health" "$vault_seal"
`.trim()

export interface VaultFacts {
  reachable: boolean
  initialized: boolean | null
  sealed: boolean | null
  sealType: string | null
}

export interface NodeChecks {
  rhel: EvidenceCheck[]
  vault: EvidenceCheck[]
  facts: VaultFacts
  /** Root filesystem size from the guest; Multipass reports only the EFI partition for these RHEL images. */
  rootBytes: number | null
}

/** Parse `df -B1 --output=size,pcent /` ("20178747392 9%") into bytes and percent used. */
export function parseRootFs(value: string | undefined): { bytes: number, usedPercent: number } | null {
  const match = (value || '').trim().match(/^(\d+)\s+(\d+)%$/)
  return match ? { bytes: Number(match[1]), usedPercent: Number(match[2]) } : null
}

const NO_FACTS: VaultFacts = { reachable: false, initialized: null, sealed: null, sealType: null }

export function parseProbe(output: string): Record<string, string> {
  return Object.fromEntries(output.split('\n').map((line) => {
    const separator = line.indexOf('=')
    return separator < 1 ? ['', ''] : [line.slice(0, separator), line.slice(separator + 1)]
  }).filter(([key]) => key))
}

function json(value: string | undefined): Record<string, unknown> | null {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** The seal type a node must report: the seal Vault is Shamir, cluster nodes use the transit seal. */
export const expectedSealType = (role: LabRole) => role === 'seal' ? 'shamir' : 'transit'

export function vaultEvidence(role: LabRole, values: Record<string, string>): { checks: EvidenceCheck[], facts: VaultFacts } {
  const health = json(values.vault_health)
  const seal = json(values.vault_seal)
  if (!health || !seal) {
    return {
      checks: [
        check('vault-service', 'Vault service', values.vault_service === 'active' ? 'pass' : 'fail', 'vault', values.vault_service || 'inactive'),
        check('vault-reachable', 'Vault API over verified TLS', 'fail', 'vault', 'No verified answer from the node API (it may be waiting for the seal Vault).'),
      ],
      facts: NO_FACTS,
    }
  }
  const initialized = seal.initialized === true
  const sealed = seal.sealed !== false
  const sealType = typeof seal.type === 'string' ? seal.type : null
  const expected = expectedSealType(role)
  const haRole = health.standby === true ? 'Standby' : health.performance_standby === true ? 'Performance standby' : sealed ? 'Unavailable' : 'Active'
  return {
    checks: [
      check('vault-service', 'Vault service', values.vault_service === 'active' ? 'pass' : 'fail', 'vault', values.vault_service || 'inactive'),
      check('vault-tls', 'Vault API over verified TLS', 'pass', 'vault', 'Answered with the lab CA'),
      check('vault-initialized', 'Initialized', initialized ? 'pass' : 'fail', 'vault', initialized ? 'Initialized' : 'Not initialized'),
      check('vault-seal', 'Seal state', sealed ? 'fail' : 'pass', 'vault', sealed ? 'Sealed' : 'Unsealed'),
      check('vault-seal-type', 'Seal type', sealType === expected ? 'pass' : 'fail', 'vault', `${sealType ?? 'unknown'} (expected ${expected})`),
      check('vault-role', 'HA role', sealed ? 'unknown' : 'pass', 'vault', haRole),
    ],
    facts: { reachable: true, initialized, sealed, sealType },
  }
}

export async function nodeChecks(name: string, address: string | undefined, role: LabRole): Promise<NodeChecks> {
  return cached(`node:${name}:${address || 'unknown'}`, 10_000, async () => {
    if (!address || isIP(address) !== 4) {
      return {
        rhel: [check('rhel-reachable', 'Guest checks', 'unknown', 'rhel', 'A validated node address is unavailable.')],
        vault: [check('vault-reachable', 'Vault health', 'unknown', 'vault', 'A validated node address is unavailable.')],
        facts: NO_FACTS,
        rootBytes: null,
      }
    }
    try {
      const base = `https://${address}:8200/v1/sys`
      const healthUrl = role === 'seal' ? `${base}/health` : `${base}/health?standbyok=true&perfstandbyok=true`
      const { stdout } = await runCommand('multipass', ['exec', name, '--', 'sudo', '/bin/sh', '-c', NODE_PROBE, 'node-probe', healthUrl, `${base}/seal-status`], { timeoutMs: 12_000 })
      const values = parseProbe(stdout.trim())
      const rhel = [
        check('rhel-release', 'Operating system', /^Red Hat Enterprise Linux(?: Server)? release 9\./.test(values.release || '') ? 'pass' : 'warn', 'rhel', values.release || 'Release unavailable'),
        check('architecture', 'Architecture', ['aarch64', 'arm64'].includes(values.architecture || '') ? 'pass' : 'warn', 'rhel', values.architecture || 'Unknown'),
        check('selinux', 'SELinux', values.selinux === 'Enforcing' ? 'pass' : 'fail', 'rhel', values.selinux || 'Unknown'),
        check('swap', 'Swap', values.swap === 'disabled' ? 'pass' : 'fail', 'rhel', values.swap === 'disabled' ? 'Disabled' : 'Active swap detected'),
        check('firewalld', 'Firewall', values.firewall === 'active' ? 'pass' : 'fail', 'rhel', values.firewall || 'Inactive'),
        check('systemd', 'Failed services', values.failed_services === '0' ? 'pass' : 'warn', 'rhel', values.failed_services === '0' ? 'None' : `${values.failed_services || 'Unknown'} failed`),
      ]
      const root = parseRootFs(values.root_fs)
      rhel.push(root
        ? check('root-fs', 'Root filesystem', root.usedPercent < 85 ? 'pass' : 'warn', 'rhel', `${(root.bytes / 1024 ** 3).toFixed(1)} GB, ${root.usedPercent}% used`)
        : check('root-fs', 'Root filesystem', 'unknown', 'rhel', 'Size unavailable'))
      const vault = vaultEvidence(role, values)
      return { rhel, vault: vault.checks, facts: vault.facts, rootBytes: root?.bytes ?? null }
    } catch {
      return {
        rhel: [check('rhel-reachable', 'Guest checks', 'fail', 'rhel', 'The guest did not answer the fixed read-only probe.')],
        vault: [check('vault-reachable', 'Vault health', 'fail', 'vault', 'The guest did not answer the fixed read-only probe.')],
        facts: NO_FACTS,
        rootBytes: null,
      }
    }
  })
}

function fromReport(items: ReportCheck[], scope: EvidenceCheck['scope'], at: string): EvidenceCheck[] {
  return items.map(item => check(`report-${scope}-${item.id}`, item.label, item.status, 'vault', item.detail, scope, at))
}

/**
 * Cluster and seal-chain evidence from the last `make validate` run. The UI
 * never runs Ansible; it shows the report with its age, and a missing or
 * stale report is never treated as passing.
 */
export function reportEvidence(report: ValidationReport, now = Date.now()): { cluster: EvidenceCheck[], sealChain: EvidenceCheck[] } {
  if (!report.readable || !report.generatedAt) {
    const missing = check('report-missing', 'Validation report', 'unknown', 'ansible', 'No .build/validation.json yet — run make validate.', 'cluster')
    return { cluster: [missing], sealChain: [{ ...missing, scope: 'seal-chain' }] }
  }
  const at = report.generatedAt
  const ageMs = now - Date.parse(at)
  const minutes = Math.max(0, Math.round(ageMs / 60_000))
  const age = minutes < 90 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`
  const freshness = check('report-age', 'Validation report age', ageMs <= REPORT_MAX_AGE_MS ? 'pass' : 'warn', 'ansible', `make validate ran ${age}`, 'cluster', at)
  return {
    cluster: [freshness, ...fromReport(report.cluster, 'cluster', at)],
    sealChain: [{ ...freshness, id: 'report-age-seal', scope: 'seal-chain' }, ...fromReport(report.sealChain, 'seal-chain', at)],
  }
}
