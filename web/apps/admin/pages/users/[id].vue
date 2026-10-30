<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUserDetail, AppUser, Wallet } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { canManageUsers, userLabel } from '#base/utils/users'

/**
 * B-09 — user detail: profile, wallet, subscription, history tabs and the support actions
 * (credit / debit coins, block / unblock). SUPPORT and ADMIN only.
 */
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const api = useUsersApi()
const monetization = useMonetizationApi()

const allowed = computed(() => canManageUsers(auth.user?.role))
const userId = computed(() => String(route.params.id))

const { data, status, error, refresh } = useAsyncData(
  () => `admin-user-${userId.value}`,
  () => (allowed.value ? api.getUser(userId.value) : Promise.resolve(null)),
  { watch: [userId, allowed] },
)
const detail = ref<AdminUserDetail | null>(data.value ?? null)
watch(data, (value) => {
  detail.value = value ?? null
})

// Bonus validity shown in the adjustment dialog; a 403 for SUPPORT is silently ignored.
const bonusValidityDays = ref<number | undefined>()
if (auth.user?.role === 'ADMIN') {
  monetization
    .getSettings()
    .then((settings) => {
      bonusValidityDays.value = settings.bonusValidityDays
    })
    .catch(() => undefined)
}

const notFound = computed(() => ApiError.is(error.value) && error.value.status === 404)
const forbidden = computed(
  () => !allowed.value || (ApiError.is(error.value) && error.value.status === 403),
)
const title = computed(() => (detail.value ? userLabel(detail.value.user) : t('users.title')))
const canAct = computed(() => {
  const status = detail.value?.user.status
  return status === 'ACTIVE' || status === 'BLOCKED' || status === 'DELETION_PENDING'
})

const adjustVisible = ref(false)
const blockVisible = ref(false)

function onAdjusted(wallet: Wallet): void {
  if (!detail.value) return
  detail.value = { ...detail.value, wallet }
  // The ledger line and the audit entry live server-side: reload to show them.
  void refresh()
}

function onStatusChanged(user: AppUser): void {
  if (!detail.value) return
  detail.value = { ...detail.value, user: { ...detail.value.user, ...user } }
  void refresh()
}
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="title"
      :subtitle="detail ? (detail.user.email ?? detail.user.phone ?? undefined) : undefined"
      :crumbs="[{ label: t('nav.users'), to: '/users' }, { label: title }]"
    >
      <template v-if="detail && !forbidden" #actions>
        <Button
          :label="t('common.refresh')"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          size="small"
          :loading="status === 'pending'"
          @click="refresh()"
        />
        <Button
          :label="t('users.actions.adjust')"
          icon="pi pi-wallet"
          size="small"
          :disabled="!canAct"
          data-testid="open-adjust"
          @click="adjustVisible = true"
        />
        <Button
          :label="
            detail.user.status === 'BLOCKED' ? t('users.actions.unblock') : t('users.actions.block')
          "
          :icon="detail.user.status === 'BLOCKED' ? 'pi pi-lock-open' : 'pi pi-ban'"
          :severity="detail.user.status === 'BLOCKED' ? 'secondary' : 'danger'"
          outlined
          size="small"
          :disabled="!canAct"
          data-testid="open-block"
          @click="blockVisible = true"
        />
      </template>
    </LayoutPageHeader>

    <LayoutForbidden v-if="forbidden" :hint="t('users.restricted')" />

    <section
      v-else-if="notFound"
      class="mx-auto max-w-xl rounded-lg border border-dashed border-surface-300 bg-surface-0 p-10 text-center"
      data-testid="user-not-found"
    >
      <i class="pi pi-user-minus text-4xl text-muted-color" aria-hidden="true" />
      <p class="mt-4 font-medium">{{ t('users.detail.notFound') }}</p>
      <NuxtLink to="/users" class="mt-6 inline-block">
        <Button :label="t('users.detail.back')" severity="secondary" outlined size="small" />
      </NuxtLink>
    </section>

    <Message v-else-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('users.detail.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <div v-else-if="!detail" class="flex items-center gap-2 py-8">
      <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="6" />
      <span class="text-sm text-muted-color">{{ t('common.loading') }}</span>
    </div>

    <div v-else class="flex flex-col gap-6" data-testid="user-detail">
      <div class="grid gap-4 xl:grid-cols-3">
        <UsersProfileCard
          :user="detail.user"
          :last-seen-at="detail.lastSeenAt"
          :devices="detail.devices"
        />
        <UsersWalletCard :wallet="detail.wallet" />
        <UsersSubscriptionCard :subscription="detail.subscription" />
      </div>

      <UsersHistoryTabs
        :unlocks="detail.unlocks"
        :purchases="detail.purchases"
        :ledger="detail.recentLedger"
      />

      <UsersCoinAdjustmentDialog
        v-model:visible="adjustVisible"
        :user="detail.user"
        :wallet="detail.wallet"
        :bonus-validity-days="bonusValidityDays"
        @adjusted="onAdjusted"
      />
      <UsersBlockUserDialog
        v-model:visible="blockVisible"
        :user="detail.user"
        @changed="onStatusChanged"
      />
    </div>
  </div>
</template>
