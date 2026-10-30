import type { ApiSessionFactory } from '#base/composables/useApi'
import { useRechargeSession } from '#base/stores/recharge-session'

/**
 * Makes `useApi()` authenticate as the end user (recharge session) instead of the back-office
 * JWT: `Authorization: Bearer <accessToken>`, one `/auth/refresh` on 401, then /login.
 */
export default defineNuxtPlugin(() => {
  const factory: ApiSessionFactory = () => {
    const session = useRechargeSession()
    return {
      get token() {
        return session.token
      },
      tryRefresh: () => session.refresh(),
      async onUnauthorized() {
        session.clearSession()
        const route = useRoute()
        if (route.path !== '/login') {
          await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
        }
      },
    }
  }
  return { provide: { apiSession: factory } }
})
