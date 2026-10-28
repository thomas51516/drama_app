/**
 * Every page requires a session unless it declares `definePageMeta({ public: true })`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  const isPublic = to.meta.public === true

  if (auth.isAuthenticated && !auth.user) {
    await auth.fetchMe()
  }

  if (isPublic) {
    if (auth.isAuthenticated && to.path === '/login') {
      return navigateTo('/', { replace: true })
    }
    return
  }

  if (!auth.isAuthenticated) {
    return navigateTo(
      { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} },
      { replace: true },
    )
  }
})
