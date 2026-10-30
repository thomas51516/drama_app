/**
 * Recharge site: pages are public unless they touch the account (`/pay`, `/history`,
 * `/account`, `/mock-payment`). Overrides the back-office middleware of the base layer.
 */
const PRIVATE_PREFIXES = ['/pay', '/history', '/account', '/mock-payment']

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useRechargeSession()
  const config = useRuntimeConfig()
  const isPrivate = PRIVATE_PREFIXES.some(
    (prefix) => to.path === prefix || to.path.startsWith(`${prefix}/`),
  )

  // Mock mode keeps its state in each runtime: never restore the profile on the server, the
  // client does it (otherwise a server-side 401 would log the browser out on every refresh).
  const canRestore = !(import.meta.server && config.public.apiMock)
  if (canRestore && session.isAuthenticated && !session.user) {
    await session.fetchMe()
  }

  if (to.path === '/login' && session.isAuthenticated) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/packs'
    return navigateTo(redirect.startsWith('/') ? redirect : '/packs', { replace: true })
  }

  if (isPrivate && !session.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } }, { replace: true })
  }
})
