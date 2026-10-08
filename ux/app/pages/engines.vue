<script setup lang="ts">
import type { EnginesResponse } from '#shared/types'
import { engineName, isEnterpriseEngine } from '#shared/engines'

useHead({ title: 'Engines · red_pass' })
// The shell (mode, seal chain, attention badge) reads the control plane; keep it fresh like every page.
usePlaneLive()
const { data, status, refresh } = await useFetch<EnginesResponse>('/api/engines', { server: false, lazy: true })
const checking = computed(() => status.value === 'pending')
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => refresh(), 30_000) })
onBeforeUnmount(() => clearInterval(timer))

const engines = computed(() => data.value?.engines ?? [])
const checkedAt = computed(() => data.value ? new Date(data.value.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null)
const notice = computed(() => {
  switch (data.value?.state) {
    case 'unreachable': return { title: 'Vault did not answer', text: 'The console could not reach Vault through the front door. Check make status and the proxy; the page retries every 30 seconds.' }
    case 'denied': return { title: 'Vault refused the console’s token', text: 'The read-only engines token has expired or was revoked. Run make engines to issue a new one.' }
    case 'unconfigured': return { title: 'Engines are not set up yet', text: 'The console has no Vault address or token for this page. Run make engines.' }
    default: return null
  }
})
</script>

<template>
  <div>
    <section class="vg-hero fleet-hero" aria-labelledby="engines-title">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Vault Enterprise · namespace <span class="mono">{{ data?.namespace ?? 'engines' }}</span></p>
          <h1 id="engines-title">Secrets engines</h1>
          <p>Every engine Vault reports as mounted, read live with a token that can list these mounts and nothing else. Display only: Ansible mounts them, Vault is the evidence.</p>
        </div>
        <button class="secondary-button" type="button" :disabled="checking" @click="refresh()">
          <svg class="button-icon" :class="{ spinning: checking }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v5h-5" /></svg>
          {{ checking ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
      <p v-if="data?.state === 'live'" class="hero-status" role="status">
        {{ engines.length }} live · checked {{ checkedAt }} · from Vault
      </p>
      <p v-else-if="data" class="hero-status attention" role="status">No live answer from Vault · checked {{ checkedAt }}</p>
    </section>

    <div v-if="!data" class="skeleton" aria-label="Loading"><div /><div /><div /></div>

    <section v-else-if="notice" class="empty vg-glass" role="alert">
      <h2>{{ notice.title }}</h2>
      <p>{{ notice.text }}</p>
    </section>

    <section v-else-if="!engines.length" class="empty vg-glass">
      <h2>No engines enabled</h2>
      <p>Vault reports no secrets engines in this namespace. Run make engines to mount them.</p>
    </section>

    <section v-else class="panel vg-glass" aria-labelledby="engines-list-title">
      <div class="panel-head">
        <div>
          <h2 id="engines-list-title">Mounted engines</h2>
          <p>Read from <span class="mono">sys/mounts</span> in namespace <span class="mono">{{ data.namespace }}</span>; built-in mounts are not shown.</p>
        </div>
        <span class="source-tag">live Vault</span>
      </div>
      <ul class="engine-grid">
        <li v-for="engine in engines" :key="engine.path" class="vg-tile engine-tile">
          <div class="engine-top">
            <span class="engine-live"><i aria-hidden="true" />Live</span>
            <span v-if="isEnterpriseEngine(engine.type)" class="vg-pill engine-ent">Enterprise</span>
          </div>
          <h3>{{ engineName(engine.type) }}</h3>
          <p class="mono engine-path">{{ data.namespace }}/{{ engine.path }}/</p>
          <p class="engine-desc">{{ engine.description || '—' }}</p>
          <dl class="engine-meta">
            <dt>Type</dt><dd class="mono">{{ engine.type }}</dd>
            <dt>Plugin</dt><dd class="mono">{{ engine.pluginVersion ?? 'not reported' }}</dd>
          </dl>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.engine-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
/* Display-only tiles: no hover lift that suggests a click target. */
.engine-tile:hover { transform: none; border-color: var(--vg-glass-border); }
.engine-tile::before { background: var(--vg-healthy); opacity: 0.7; }
.engine-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; }
.engine-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--vg-healthy); }
.engine-live i { width: 8px; height: 8px; border-radius: 50%; background: var(--vg-healthy); box-shadow: 0 0 6px color-mix(in srgb, var(--vg-hue-green) 60%, transparent); animation: engineLive 2.4s ease-in-out infinite; }
.engine-ent { background: color-mix(in srgb, var(--vg-hue-slate) 12%, transparent); color: var(--vg-text-secondary); border: 1px solid color-mix(in srgb, var(--vg-hue-slate) 25%, transparent); }
.engine-tile h3 { margin: 6px 0 0; font-size: 16px; font-weight: 720; letter-spacing: -0.01em; color: var(--vg-text-primary); }
.engine-path { margin: 0; color: var(--vg-text-secondary); overflow-wrap: anywhere; }
.engine-desc { margin: 4px 0 0; font-size: 12.5px; color: var(--vg-text-muted); }
.engine-meta { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--vg-border-subtle); font-size: 11.5px; }
.engine-meta dt { color: var(--vg-text-muted); font-weight: 600; }
.engine-meta dd { margin: 0; color: var(--vg-text-secondary); font-size: 11px; overflow-wrap: anywhere; }
@keyframes engineLive { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .engine-live i { animation: none; } }
@media (max-width: 520px) { .engine-grid { grid-template-columns: 1fr; } }
</style>
