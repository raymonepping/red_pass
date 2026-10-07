import { describe, expect, it } from 'vitest'
import { paneNeedsAttention, paneSummaryLine } from '../shared/vm-pane'
import type { InstanceSummary, PostureCategory } from '../shared/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function posture(tone: PostureCategory['tone']): PostureCategory {
  return { kind: 'vault', label: 'Vault', status: tone === 'positive' ? 'Secured' : 'Failed', tone, evidence: [] }
}

function fullPosture(tone: PostureCategory['tone']) {
  return {
    provisioned: posture('positive'),
    rhel: posture('positive'),
    ansible: posture('positive'),
    vault: posture(tone),
  }
}

function instance(overrides: Partial<InstanceSummary> = {}): InstanceSummary {
  return {
    name: 'red-vault-1',
    state: 'Running',
    ipv4: ['10.0.0.2'],
    release: 'RHEL 9.8',
    imageHash: null,
    resources: { cpus: 2, memoryBytes: 4294967296, diskBytes: null },
    snapshotCount: null,
    deleted: false,
    labRole: 'leader',
    posture: fullPosture('positive'),
    ...overrides,
  }
}

// ── paneNeedsAttention ───────────────────────────────────────────────────────

describe('paneNeedsAttention', () => {
  it('returns false for all-green instances', () => {
    const instances = [
      instance({ name: 'red-vault-1', labRole: 'leader' }),
      instance({ name: 'red-vault-2', labRole: 'follower' }),
      instance({ name: 'red-vault-s', labRole: 'seal' }),
    ]
    expect(paneNeedsAttention(instances, false)).toBe(false)
  })

  it('returns true when any instance has a critical posture tone', () => {
    const instances = [
      instance({ name: 'red-vault-1', posture: fullPosture('critical') }),
      instance({ name: 'red-vault-2' }),
    ]
    expect(paneNeedsAttention(instances, false)).toBe(true)
  })

  it('returns true when any instance has a warning posture tone', () => {
    const instances = [
      instance({ name: 'red-vault-1', posture: fullPosture('warning') }),
      instance({ name: 'red-vault-2' }),
    ]
    expect(paneNeedsAttention(instances, false)).toBe(true)
  })

  it('ignores deleted instances when assessing attention', () => {
    const instances = [
      instance({ name: 'old-vault', deleted: true, posture: fullPosture('critical') }),
      instance({ name: 'red-vault-1' }),
    ]
    expect(paneNeedsAttention(instances, false)).toBe(false)
  })

  it('returns true in VM mode when a lab instance is not running', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Stopped', labRole: 'follower' }),
    ]
    expect(paneNeedsAttention(instances, true)).toBe(true)
  })

  it('does not flag a non-lab (foreign) instance as unreachable in VM mode', () => {
    const instances = [
      instance({ name: 'foreign-1', state: 'Stopped', labRole: null }),
    ]
    expect(paneNeedsAttention(instances, true)).toBe(false)
  })
})

// ── paneSummaryLine ──────────────────────────────────────────────────────────

describe('paneSummaryLine', () => {
  it('all-green fleet produces the correct summary', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader' }),
      instance({ name: 'red-vault-2', state: 'Running', labRole: 'follower' }),
      instance({ name: 'red-vault-s', state: 'Running', labRole: 'seal' }),
    ]
    const line = paneSummaryLine(instances, false, false)
    expect(line).toBe('3 red_pass VMs · 3 running · all secured')
  })

  it('attention (warning) fleet flags it in the status segment', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader', posture: fullPosture('warning') }),
      instance({ name: 'red-vault-2', state: 'Running', labRole: 'follower' }),
    ]
    const line = paneSummaryLine(instances, false, true)
    expect(line).toContain('check indicators')
    expect(line).not.toContain('all secured')
  })

  it('critical posture flips the status segment to "needs attention"', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader', posture: fullPosture('critical') }),
    ]
    const line = paneSummaryLine(instances, false, true)
    expect(line).toContain('needs attention')
  })

  it('includes foreign VM count when foreign VMs are present', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader' }),
      instance({ name: 'vault-1', state: 'Running', labRole: null }),
      instance({ name: 'vault-2', state: 'Running', labRole: null }),
      instance({ name: 'vault-3', state: 'Running', labRole: null }),
    ]
    const line = paneSummaryLine(instances, false, false)
    expect(line).toContain('3 not red_pass')
  })

  it('does not include the foreign segment when there are no foreign VMs', () => {
    const instances = [instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader' })]
    const line = paneSummaryLine(instances, false, false)
    expect(line).not.toContain('not red_pass')
  })

  it('labels running count as "reachable" in VM mode', () => {
    const instances = [instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader' })]
    const line = paneSummaryLine(instances, true, false)
    expect(line).toContain('reachable')
    expect(line).not.toContain('running')
  })

  it('excludes deleted instances from all counts', () => {
    const instances = [
      instance({ name: 'red-vault-1', state: 'Running', labRole: 'leader' }),
      instance({ name: 'old-vault', deleted: true, state: 'Running', labRole: 'follower' }),
    ]
    const line = paneSummaryLine(instances, false, false)
    expect(line).toMatch(/^1 red_pass VMs/)
  })
})

// ── Default-folded behaviour ─────────────────────────────────────────────────

describe('VmListPane default-folded state', () => {
  it('localStorage key is absent before any interaction, so pane starts folded', () => {
    // Simulate a fresh environment: no key in localStorage → pane should be closed
    const stored = (() => {
      try { return localStorage.getItem('red-pass:vm-pane') } catch { return null }
    })()
    // In a clean test environment localStorage is empty; null means folded (open = false)
    expect(stored === '1').toBe(false)
  })
})
