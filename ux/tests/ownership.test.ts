import { describe, expect, it } from 'vitest'
import { convergenceState, parseConvergence, parseOwnership, parseValidation, provisionOwnership } from '../server/utils/repository'

const manifest = parseOwnership({
  project: 'red_pass',
  playbook: 'ansible/provision.yml',
  nodes: {
    'red-vault-1': { launched_by_ansible: true, role: 'leader', ipv4: '192.168.252.13', first_seen: '2026-10-07T12:01:08Z', token: 'never-read' },
    'red-vault-s': { launched_by_ansible: true, role: 'seal', ipv4: '192.168.252.10' },
    'not-ours': { launched_by_ansible: false, role: 'leader' },
    'bad;name': { launched_by_ansible: true, role: 'leader' },
    'odd-role': { launched_by_ansible: true, role: 'admin' },
  },
})
const digest = 'a'.repeat(64)

describe('Ansible ownership truth rules', () => {
  it('is unknown when the manifest is unreadable', () => expect(provisionOwnership('red-vault-1', parseOwnership(null))).toBe('unknown'))
  it('is unknown for a manifest from another project', () => expect(provisionOwnership('red-vault-1', parseOwnership({ project: 'multi_pass', nodes: {} }))).toBe('unknown'))
  it('proves provisioning by manifest membership', () => expect(provisionOwnership('red-vault-1', manifest)).toBe('provisioned'))
  it('is unmanaged when a readable manifest excludes the VM', () => expect(provisionOwnership('vault-1', manifest)).toBe('unmanaged'))
  it('keeps only allow-listed nodes and fields', () => {
    expect(Object.keys(manifest.nodes).sort()).toEqual(['red-vault-1', 'red-vault-s'])
    expect(manifest.nodes['red-vault-1']).toEqual({ role: 'leader', ipv4: '192.168.252.13', firstSeen: '2026-10-07T12:01:08Z', cpus: null, memory: null })
  })
})

describe('Ansible convergence truth rules', () => {
  const stamp = parseConvergence({ result: 'success', automation_digest: digest, finished_at: '2026-10-07T12:29:59Z', nodes: ['red-vault-1', 'red-vault-s'] })
  it('is converged only when the node ran and the digest matches', () => expect(convergenceState('red-vault-1', stamp, digest)).toBe('converged'))
  it('is outdated when the automation changed since the run', () => expect(convergenceState('red-vault-1', stamp, 'b'.repeat(64))).toBe('outdated'))
  it('is never-run for a node outside the stamp', () => expect(convergenceState('red-vault-2', stamp, digest)).toBe('never-run'))
  it('is never-run without a stamp', () => expect(convergenceState('red-vault-1', parseConvergence(null), digest)).toBe('never-run'))
  it('is failed for an unsuccessful run', () => expect(convergenceState('red-vault-1', parseConvergence({ result: 'failed', automation_digest: digest, nodes: ['red-vault-1'] }), digest)).toBe('failed'))
  it('is unknown when the current digest cannot be computed', () => expect(convergenceState('red-vault-1', stamp, null)).toBe('unknown'))
  it('rejects a malformed digest', () => expect(parseConvergence({ result: 'success', automation_digest: 'zz', nodes: [] }).digest).toBeNull())
})

describe('validation report parsing', () => {
  it('coerces unexpected statuses to unknown and drops malformed rows', () => {
    const report = parseValidation({ generated_at: '2026-10-07T12:30:00Z', cluster: [{ id: 'raft_voters', label: 'Raft voters', status: 'pass', detail: '3 / 3' }, { id: 'x', label: 'X', status: 'great' }, { label: 'no id' }], seal_chain: 'nope' })
    expect(report.cluster.map(item => item.status)).toEqual(['pass', 'unknown'])
    expect(report.sealChain).toEqual([])
  })
})
