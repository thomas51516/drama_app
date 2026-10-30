import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PendingOrderMemo } from '../utils/topup'

const STORAGE_KEY = 'drama_topup_orders'

interface StoredMemo extends PendingOrderMemo {
  /** Set when the user left for the payment provider: the pay page then polls on return. */
  leftAt: string | null
}

function readStorage(): Record<string, StoredMemo> {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, StoredMemo>) : {}
  } catch {
    return {}
  }
}

function writeStorage(memos: Record<string, StoredMemo>): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memos))
  } catch {
    // Private mode or quota: the pay page falls back to the API alone.
  }
}

/**
 * What the recharge site remembers about the orders it created in this tab: the `paymentUrl`
 * and the amount (the GET may omit them) and whether the user already left for the provider.
 * Kept in sessionStorage so a return from the provider (new document) still finds it.
 */
export const useTopupOrdersStore = defineStore('topupOrders', () => {
  const memos = ref<Record<string, StoredMemo>>({})
  let loaded = false

  function load(): void {
    if (loaded || import.meta.server) return
    memos.value = readStorage()
    loaded = true
  }

  function remember(memo: PendingOrderMemo): void {
    load()
    memos.value = { ...memos.value, [memo.orderId]: { ...memo, leftAt: null } }
    writeStorage(memos.value)
  }

  function get(orderId: string): StoredMemo | null {
    load()
    return memos.value[orderId] ?? null
  }

  function markLeft(orderId: string): void {
    load()
    const memo = memos.value[orderId]
    if (!memo) return
    memos.value = { ...memos.value, [orderId]: { ...memo, leftAt: new Date().toISOString() } }
    writeStorage(memos.value)
  }

  function forget(orderId: string): void {
    load()
    const { [orderId]: _dropped, ...rest } = memos.value
    memos.value = rest
    writeStorage(memos.value)
  }

  return { memos, remember, get, markLeft, forget }
})
