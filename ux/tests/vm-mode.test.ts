import { afterEach, describe, expect, it } from 'vitest'
import { labMode } from '../server/utils/mode'
import { allowedOrigins, originAllowed } from '../server/utils/security'
import { parseProbe, serviceEvidence } from '../server/utils/checks'
import { isVaultRole } from '../shared/posture'

afterEach(() => { delete process.env.RED_PASS_MODE })

describe('provider selection', () => {
  it('defaults to host mode', () => expect(labMode()).toBe('host'))
  it('switches to observe-only VM mode only on the exact value', () => {
    process.env.RED_PASS_MODE = 'vm'
    expect(labMode()).toBe('vm')
    process.env.RED_PASS_MODE = 'VM; rm -rf'
    expect(labMode()).toBe('host')
  })
})

describe('origin allow-list', () => {
  const extra = allowedOrigins('https://192.168.252.20:3443, https://192.168.252.30/ ,javascript:alert(1),')
  it('parses only clean origins', () => expect(extra).toEqual(['https://192.168.252.20:3443', 'https://192.168.252.30']))
  it('accepts a configured origin exactly', () => expect(originAllowed('https://192.168.252.20:3443', 'x', extra)).toBe(true))
  it('rejects a near miss', () => expect(originAllowed('https://192.168.252.20:3444', 'x', extra)).toBe(false))
  it('accepts loopback only for its own host', () => {
    expect(originAllowed('http://127.0.0.1:3310', '127.0.0.1:3310', [])).toBe(true)
    expect(originAllowed('http://127.0.0.1:3310', 'evil:3310', [])).toBe(false)
  })
  it('rejects garbage', () => expect(originAllowed('not a url', 'x', extra)).toBe(false))
})

describe('service-node evidence', () => {
  const values = parseProbe('release=Red Hat Enterprise Linux release 9.8 (Plow)\nservice_unit=red-ux\nservice_active=active\nservice_http=200')
  it('passes an active service answering 200', () => expect(serviceEvidence(values).every(item => item.status === 'pass')).toBe(true))
  it('fails a service that does not answer', () => expect(serviceEvidence({ ...values, service_http: '000' }).some(item => item.status === 'fail')).toBe(true))
  it('never treats a service VM as a Vault node', () => {
    expect(isVaultRole('ux')).toBe(false)
    expect(isVaultRole('seal')).toBe(true)
  })
})
