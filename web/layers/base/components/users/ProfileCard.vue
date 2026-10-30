<script setup lang="ts">
import type { AppUser } from '../../types/api'
import { countryName } from '../../utils/countries'
import { userStatusSeverity } from '../../utils/users'

/** Profile card of the user detail (B-09): type, providers, country, language, status, dates. */
defineProps<{
  user: AppUser
  lastSeenAt: string | null
  devices: number
}>()

const { t, d, locale } = useI18n()

function formatDate(iso: string | null | undefined): string {
  return iso ? d(new Date(iso), 'long') : t('common.never')
}
</script>

<template>
  <section class="rounded-lg border border-surface-200 bg-surface-0 p-5" data-testid="user-profile">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ t('users.detail.profile') }}</h2>
      <Tag :value="t(`users.status.${user.status}`)" :severity="userStatusSeverity(user.status)" />
    </div>
    <dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div class="sm:col-span-2">
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.id') }}</dt>
        <dd class="font-mono text-xs break-all">{{ user.id }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.type') }}</dt>
        <dd class="font-medium">{{ t(`users.type.${user.type}`) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.providers') }}</dt>
        <dd class="flex flex-wrap gap-1">
          <Tag
            v-for="provider in user.providers"
            :key="provider"
            :value="t(`users.providers.${provider}`)"
            severity="secondary"
          />
          <span v-if="user.providers.length === 0" class="text-muted-color">{{
            t('users.providers.none')
          }}</span>
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.country') }}</dt>
        <dd class="font-medium">
          <template v-if="user.country"
            >{{ countryName(user.country, locale) }}
            <span class="font-mono text-xs text-muted-color">{{ user.country }}</span></template
          >
          <span v-else class="text-muted-color">—</span>
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.language') }}</dt>
        <dd class="font-medium uppercase">{{ user.language }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.lastSeen') }}</dt>
        <dd class="font-medium tabular-nums">{{ formatDate(lastSeenAt ?? user.lastSeenAt) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.createdAt') }}</dt>
        <dd class="font-medium tabular-nums">{{ formatDate(user.createdAt) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.devices') }}</dt>
        <dd class="font-medium tabular-nums">{{ devices }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">VIP</dt>
        <dd class="font-medium">
          {{ t(`users.vip.${user.vipStatus}`) }}
          <span v-if="user.vipExpiresAt" class="text-xs text-muted-color tabular-nums">
            · {{ formatDate(user.vipExpiresAt) }}
          </span>
        </dd>
      </div>
    </dl>
    <Message
      v-if="user.status === 'DELETION_PENDING' && user.deletionScheduledAt"
      severity="warn"
      :closable="false"
      size="small"
      class="mt-3"
    >
      {{ t('users.detail.deletionScheduled', { date: formatDate(user.deletionScheduledAt) }) }}
    </Message>
  </section>
</template>
