export type EvidenceStatus = 'pass' | 'warn' | 'fail' | 'unknown'
export type EvidenceScope = 'node' | 'cluster' | 'seal-chain' | 'identity' | 'front-door'
export type EvidenceSource = 'multipass' | 'ansible' | 'rhel' | 'vault'
/** The fourth posture slot is `vault` on Vault nodes and `service` on service VMs. */
export type PostureKind = 'provisioned' | 'rhel' | 'ansible' | 'vault' | 'service'
/** Role of a red_pass node as recorded by Ansible; null for any other VM. */
export type LabRole = 'seal' | 'leader' | 'follower' | 'ux' | 'identity' | 'proxy' | 'agent'
export type VaultRole = Extract<LabRole, 'seal' | 'leader' | 'follower'>
export type LabMode = 'host' | 'vm'

export interface EvidenceCheck {
  id: string
  label: string
  status: EvidenceStatus
  scope: EvidenceScope
  source: EvidenceSource
  detail: string
  observedAt: string
}

export interface PostureCategory {
  kind: PostureKind
  label: string
  status: string
  tone: 'positive' | 'warning' | 'critical' | 'neutral'
  evidence: EvidenceCheck[]
}

export interface InstanceResources {
  cpus: number | null
  memoryBytes: number | null
  diskBytes: number | null
}

export interface InstanceSummary {
  name: string
  state: string
  ipv4: string[]
  release: string | null
  imageHash: string | null
  resources: InstanceResources
  snapshotCount: number | null
  deleted: boolean
  labRole: LabRole | null
  /** provisioned → rhel → ansible → vault|service (fourth slot keyed `vault`). */
  posture: { provisioned: PostureCategory, rhel: PostureCategory, ansible: PostureCategory, vault: PostureCategory }
}

export interface EnvironmentSummary {
  total: number
  running: number
  stopped: number
  deleted: number
  cpus: number
  memoryBytes: number
}

/** One edge of the seal chain: the seal Vault feeding a cluster node. */
export interface SealLink {
  node: string
  sealType: string | null
  sealed: boolean | null
  status: EvidenceStatus
  detail: string
}

export interface SealChain {
  sealNode: string
  sealVault: { status: EvidenceStatus, sealed: boolean | null, detail: string }
  /** The seal agent between the seal Vault and the cluster (prompt 09), if any. */
  agent: { node: string, status: EvidenceStatus, detail: string } | null
  links: SealLink[]
}

/** One public entry point of the front door and its live backends. */
export interface FrontDoorEntry {
  key: string
  label: string
  url: string
  /** STANDBY: a Vault node that is healthy but not active (writes go to the leader only). */
  servers: { name: string, status: 'UP' | 'STANDBY' | 'DOWN' | 'MAINT' | 'UNKNOWN' }[]
}

export interface FrontDoor {
  node: string
  entries: FrontDoorEntry[]
}

export interface InstancesResponse {
  mode: LabMode
  available: boolean
  message: string | null
  observedAt: string
  summary: EnvironmentSummary
  instances: InstanceSummary[]
  cluster: EvidenceCheck[]
  sealChain: SealChain | null
  frontDoor: FrontDoor | null
}

export interface InstanceDetailResponse {
  mode: LabMode
  available: boolean
  message: string | null
  observedAt: string
  instance: InstanceSummary | null
  cluster: EvidenceCheck[]
  sealChain: SealChain | null
  frontDoor: FrontDoor | null
}

export type InstanceAction = 'start' | 'stop' | 'restart' | 'suspend' | 'delete' | 'recover'

export interface ActionRequest {
  confirm?: boolean
  acknowledgeOwnershipDrift?: boolean
}

export interface ActionResponse {
  ok: boolean
  action: InstanceAction | 'purge'
  message: string
  instance?: InstanceSummary | null
}

export type UserRole = 'viewer' | 'operator' | 'admin'

/** What the BFF tells the browser about the person. Never a token. */
export interface SessionInfo {
  authEnabled: boolean
  authRequired: boolean
  authenticated: boolean
  user: string | null
  role: UserRole | null
}
