import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useHelpCenterApi } from '../composables/useHelpCenterApi'
import { canUseSupportInbox } from '../utils/help-center'
import { useAuthStore } from './auth'

/** Refresh period of the sidebar badge (open tickets) while the back-office is open. */
export const SUPPORT_INBOX_POLL_MS = 60_000

/**
 * Open tickets count shown as a badge on the « Centre d'aide » sidebar entry (B-03bis).
 * Only SUPPORT and ADMIN may call the inbox; other roles keep `openCount = null`.
 */
export const useSupportInboxStore = defineStore('supportInbox', () => {
  const openCount = ref<number | null>(null)
  const loadedAt = ref<number | null>(null)
  const pending = ref(false)

  async function refresh(): Promise<number | null> {
    const auth = useAuthStore()
    if (!auth.isAuthenticated || !canUseSupportInbox(auth.user?.role)) {
      openCount.value = null
      return null
    }
    if (pending.value) return openCount.value
    pending.value = true
    try {
      const page = await useHelpCenterApi().listTickets({ status: 'OPEN', page: 1, pageSize: 1 })
      openCount.value = page.total
      loadedAt.value = Date.now()
    } catch {
      // Keep the previous value: the badge is informational only.
    } finally {
      pending.value = false
    }
    return openCount.value
  }

  /** Set by the inbox page after a reply / close, without waiting for the next poll. */
  function setOpenCount(count: number): void {
    openCount.value = count
    loadedAt.value = Date.now()
  }

  function reset(): void {
    openCount.value = null
    loadedAt.value = null
  }

  return { openCount, loadedAt, pending, refresh, setOpenCount, reset }
})
