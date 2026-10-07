<script setup lang="ts">
import type { PostureCategory } from '../../shared/types'

useHead({ title: 'Fleet · red_pass' })
const config = useRuntimeConfig()
const { plane, checking, failed, refresh } = usePlane()
const selectedEvidence = ref<PostureCategory | null>(null)
const purgeOpen = ref(false)
const purgePending = ref(false)
const filter = ref<'instances' | 'trash'>('instances')
const { selectedAction, selectedInstance, pending, toast, requestAction, closeAction, confirmAction } = useOperations(() => refresh())

const ordered = computed(() => [...(plane.value?.instances || [])].sort((a, b) => {
  const rank = (role: string | null) => role === 'seal' ? 0 : role ? 1 : 2
  return rank(a.labRole) - rank(b.labRole) || a.name.localeCompare(b.name)
}))
const visible = computed(() => ordered.value.filter(item => filter.value === 'trash' ? item.deleted : !item.deleted))
const lab = computed(() => ordered.value.filter(item => item.labRole && !item.deleted))
const secured = computed(() => lab.value.filter(item => item.posture.vault.status === 'Secured').length)
const voters = computed(() => plane.value?.cluster.find(item => item.id === 'report-cluster-raft_voters'))
const observed = computed(() => plane.value?.observedAt ? new Date(plane.value.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await refresh(false)
  void refresh()
  timer = setInterval(() => refresh(), Number(config.public.refreshSeconds) * 1000)
})
onBeforeUnmount(() => clearInterval(timer))

async function purge(confirmation: string) {
  purgePending.value = true
  try {
    const result = await $fetch<{ message: string }>('/api/purge', { method: 'POST', body: { confirmation } })
    toast.value = { type: 'success', message: result.message }
    purgeOpen.value = false
    await refresh()
  } catch (err) {
    const response = err as { data?: { statusMessage?: string } }
    toast.value = { type: 'error', message: response.data?.statusMessage || 'Purge failed.' }
  } finally {
    purgePending.value = false
  }
}
</script>

<template>
  <div>
    <section class="vg-hero fleet-hero" aria-labelledby="fleet-title">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Vault Enterprise · Multipass RHEL · Ansible only</p>
          <h1 id="fleet-title">Provisioned, converged, sealed by design</h1>
          <p>Four RHEL VMs launched and configured by Ansible. Three Raft nodes auto-unseal through the seal Vault. Every indicator below is backed by evidence you can open.</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="observed"><span class="dot" :class="{ live: plane?.available && !failed }" /> Observed {{ observed }}</span>
          <button class="secondary-button" type="button" :disabled="checking" @click="refresh()">
            <svg class="button-icon" :class="{ spinning: checking }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v5h-5" /></svg>
            {{ checking ? 'Checking…' : 'Refresh' }}
          </button>
        </div>
      </div>
      <div v-if="plane?.available" class="hero-tiles">
        <div class="vg-tile"><span class="vg-tile__label">red_pass nodes</span><span class="vg-tile__value">{{ lab.length }}<small>/ 4</small></span><span class="vg-tile__sub">{{ plane.summary.total }} Multipass VMs in total</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Vault secured</span><span class="vg-tile__value" :class="secured === lab.length && lab.length ? 'is-good' : 'is-warn'">{{ secured }}<small>/ {{ lab.length }}</small></span><span class="vg-tile__sub">node and cluster evidence</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Raft voters</span><span class="vg-tile__value" :class="voters?.status === 'pass' ? 'is-good' : 'is-warn'">{{ voters?.detail.replace(/\s/g, '') || '—' }}</span><span class="vg-tile__sub">from make validate</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Running</span><span class="vg-tile__value">{{ plane.summary.running }}</span><span class="vg-tile__sub">{{ plane.summary.stopped }} stopped</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Compute</span><span class="vg-tile__value">{{ plane.summary.cpus }}<small>CPU</small></span><span class="vg-tile__sub">{{ (plane.summary.memoryBytes / 1024 ** 3).toFixed(0) }} GB memory</span></div>
      </div>
    </section>

    <section v-if="plane && !plane.available" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Multipass unavailable</h2><p>{{ plane.message }}</p></div>
      <button class="secondary-button" type="button" @click="refresh()">Try again</button>
    </section>
    <section v-else-if="failed && !plane" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Control plane unreachable</h2><p>The local API did not answer.</p></div>
      <button class="secondary-button" type="button" @click="refresh()">Try again</button>
    </section>

    <div v-if="!plane" class="skeleton" aria-label="Loading instances"><div v-for="i in 4" :key="i" /></div>

    <template v-if="plane?.available">
      <SealChainPanel :chain="plane.sealChain" :checking="checking" />

      <div class="toolbar">
        <div class="segmented" role="tablist" aria-label="Instance list">
          <button type="button" role="tab" :aria-selected="filter === 'instances'" :class="{ active: filter === 'instances' }" @click="filter = 'instances'">Instances <span>{{ plane.summary.total - plane.summary.deleted }}</span></button>
          <button type="button" role="tab" :aria-selected="filter === 'trash'" :class="{ active: filter === 'trash' }" @click="filter = 'trash'">Trash <span>{{ plane.summary.deleted }}</span></button>
        </div>
        <button v-if="filter === 'trash' && plane.summary.deleted" class="text-danger" type="button" @click="purgeOpen = true">Purge trash…</button>
      </div>

      <div v-if="visible.length" class="instance-grid">
        <InstanceCard v-for="instance in visible" :key="instance.name" :instance="instance" :busy="pending" @evidence="selectedEvidence = $event" @action="requestAction" />
      </div>
      <div v-else class="empty vg-glass">
        <h2>{{ filter === 'trash' ? 'Trash is empty' : 'No instances' }}</h2>
        <p>{{ filter === 'trash' ? 'Deleted instances stay recoverable here until purged.' : 'Run make lab to launch the red_pass VMs, then refresh.' }}</p>
      </div>
    </template>

    <EvidencePanel :category="selectedEvidence" @close="selectedEvidence = null" />
    <ActionDialog :action="selectedAction" :instance="selectedInstance" :pending="pending" @close="closeAction" @confirm="confirmAction" />
    <PurgeDialog :open="purgeOpen" :pending="purgePending" @close="purgeOpen = false" @confirm="purge" />
    <Transition name="fade"><div v-if="toast" class="toast" :class="toast.type" role="status">{{ toast.message }}</div></Transition>
  </div>
</template>
