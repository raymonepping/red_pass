<script setup lang="ts">
const route = useRoute()
const { plane } = usePlane()

const chain = computed(() => {
  const value = plane.value?.sealChain
  if (!plane.value?.available) return { tone: 'unknown', label: 'Multipass unavailable' }
  if (!value) return { tone: 'unknown', label: 'Seal chain: checking' }
  if (value.sealVault.status === 'fail') return { tone: 'critical', label: 'Seal Vault sealed' }
  if (value.sealVault.status !== 'pass') return { tone: 'unknown', label: 'Seal Vault unknown' }
  const ok = value.links.filter(link => link.status === 'pass').length
  return { tone: ok === value.links.length && ok > 0 ? 'healthy' : 'degraded', label: `Seal chain ${ok}/${value.links.length}` }
})
const title = computed(() => route.path.startsWith('/instances/') ? decodeURIComponent(String(route.params.name || 'Instance')) : 'Fleet')
</script>

<template>
  <div class="vg-shell">
    <aside class="vg-sidebar" aria-label="Primary">
      <div class="sidebar-inner">
      <NuxtLink to="/" class="sidebar-brand" aria-label="red_pass home">
        <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 15.5V8.5h4.2a2.4 2.4 0 0 1 0 4.8H8m4.6 0 2.9 2.2" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="brand-name">red_pass</span>
      </NuxtLink>
      <nav class="sidebar-nav" aria-label="Primary navigation">
        <NuxtLink to="/" class="nav-item" :class="{ active: route.path === '/' || route.path.startsWith('/instances') }">
          <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg></span>
          <span class="nav-label">Fleet</span>
        </NuxtLink>
      </nav>
      <div class="sidebar-footer">
        <p class="foot-title">Local control plane</p>
        <p class="foot-meta">127.0.0.1 · read-mostly</p>
        <p class="foot-meta">Ansible owns the lab; this view observes it.</p>
      </div>
      </div>
    </aside>

    <div class="vg-main">
      <div class="topbar-wrap">
        <header class="vg-topbar">
          <div class="topbar-left">
            <NuxtLink to="/" class="mobile-brand" aria-label="red_pass home">red_pass</NuxtLink>
            <p class="page-title">{{ title }}</p>
          </div>
          <div class="topbar-right">
            <span class="cluster-pill" :class="chain.tone" role="status">
              <span class="cluster-dot" :class="{ live: chain.tone === 'healthy' }" />
              <span class="cluster-label">{{ chain.label }}</span>
            </span>
            <span class="env-badge">LOCAL</span>
          </div>
        </header>
      </div>
      <main id="main" class="vg-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.vg-shell { display: flex; min-height: 100vh; }

.vg-sidebar {
  width: var(--sidebar-w);
  background: var(--vg-bg-shell);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border-right: 1px solid var(--vg-glass-border);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.6), 8px 0 32px -24px rgba(15, 26, 42, 0.35);
  flex-shrink: 0; align-self: stretch;
}
.sidebar-inner { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; }
.sidebar-brand {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  height: var(--topbar-h); border-bottom: 1px solid var(--vg-border-subtle);
  color: var(--vg-text-primary);
}
.brand-icon { width: 24px; height: 24px; flex-shrink: 0; }
.brand-name { font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: var(--vg-text-primary); }
.sidebar-nav { flex: 1; padding: 12px 0; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; margin: 0 8px; padding: 0 10px; height: 36px;
  font-size: 13px; font-weight: 550; color: var(--vg-text-secondary); border-radius: 8px;
  transition: background 0.18s var(--vg-ease-out), color 0.18s, box-shadow 0.18s;
}
.nav-item:hover { background: rgba(255, 255, 255, 0.55); color: var(--vg-text-primary); }
.nav-item.active {
  background: rgba(255, 255, 255, 0.85); color: var(--vg-text-primary); font-weight: 650;
  box-shadow: inset 0 0 0 1px rgba(15, 26, 42, 0.08), 0 4px 12px -8px rgba(15, 26, 42, 0.35);
}
.nav-item.active .nav-icon { color: var(--vg-action-primary); }
.nav-icon { width: 16px; height: 16px; display: flex; }
.nav-icon svg { width: 16px; height: 16px; }
.sidebar-footer { padding: 14px 16px; border-top: 1px solid var(--vg-border-subtle); }
.foot-title { margin: 0; font-size: 12px; font-weight: 650; color: var(--vg-text-secondary); }
.foot-meta { margin: 2px 0 0; font-size: 11.5px; color: var(--vg-text-muted); line-height: 1.45; }

.vg-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar-wrap { position: sticky; top: 0; z-index: 10; padding: 12px 24px 0; }
.vg-topbar {
  height: var(--topbar-h);
  background: var(--vg-bg-shell);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--vg-glass-border); border-radius: 14px;
  box-shadow: var(--vg-shadow-md), inset 0 1px 0 var(--vg-glass-hi);
  display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 20px;
}
.topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.page-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--vg-text-primary); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mobile-brand { display: none; font-weight: 800; letter-spacing: -0.02em; color: var(--vg-text-primary); }
.topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cluster-pill { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
.cluster-pill.healthy { background: var(--vg-healthy-bg); color: var(--vg-healthy); border: 1px solid color-mix(in srgb, var(--vg-hue-green) 22%, transparent); }
.cluster-pill.degraded { background: var(--vg-pending-bg); color: var(--vg-pending); border: 1px solid color-mix(in srgb, var(--vg-hue-amber) 28%, transparent); }
.cluster-pill.critical { background: var(--vg-critical-bg); color: var(--vg-critical); border: 1px solid color-mix(in srgb, var(--vg-hue-red) 22%, transparent); }
.cluster-pill.unknown { background: color-mix(in srgb, var(--vg-hue-slate) 10%, transparent); color: var(--vg-text-muted); border: 1px solid color-mix(in srgb, var(--vg-hue-slate) 20%, transparent); }
.cluster-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.cluster-dot.live { animation: vgPulse 2.4s ease infinite; box-shadow: 0 0 8px currentColor; }
.env-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: var(--vg-text-muted); border: 1px solid var(--vg-glass-border); border-radius: 5px; padding: 3px 8px; }
.vg-content { flex: 1; padding: 20px 24px 40px; min-width: 0; }

@media (max-width: 900px) {
  .vg-sidebar { display: none; }
  .mobile-brand { display: inline; }
  .page-title { display: none; }
}
@media (max-width: 640px) {
  .topbar-wrap { padding: 10px 16px 0; }
  .vg-topbar { padding: 0 14px; }
  .env-badge { display: none; }
  .vg-content { padding: 16px 16px 32px; }
}
</style>
