export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') || ''
  requireValidName(name)
  const plane = await getControlPlane()
  if (!plane.available) return { available: false, message: plane.message, observedAt: plane.observedAt, instance: null, cluster: [], sealChain: null }
  const instance = plane.instances.find(item => item.name === name)
  if (!instance) throw createError({ statusCode: 404, statusMessage: 'Instance not found.' })
  return { available: true, message: null, observedAt: plane.observedAt, instance, cluster: plane.cluster, sealChain: plane.sealChain }
})
