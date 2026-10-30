<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUserSummary } from '#base/types/api'
import { countryName } from '#base/utils/countries'
import {
  USER_SEARCH_MIN,
  canManageUsers,
  isSearchable,
  normalizeSearch,
  summaryCoins,
  userLabel,
  userStatusSeverity,
} from '#base/utils/users'

/**
 * B-09 — users: search by e-mail, phone, name or id, results table, link to the detail page.
 * SUPPORT and ADMIN only (contract v1.4).
 */
const { t, n, d, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const api = useUsersApi()
const notify = useNotify()

const allowed = computed(() => canManageUsers(auth.user?.role))

const PAGE_SIZE = 20
const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const submittedQuery = ref(normalizeSearch(query.value))
const page = ref(Math.max(1, Number(route.query.page ?? 1) || 1))

watch([submittedQuery, page], ([q, p]) => {
  void router.replace({ query: { ...route.query, q: q || undefined, page: p > 1 ? p : undefined } })
})

const { data, status, error, refresh } = useAsyncData(
  'admin-users-search',
  () =>
    allowed.value && isSearchable(submittedQuery.value)
      ? api.searchUsers({ q: submittedQuery.value, page: page.value, pageSize: PAGE_SIZE })
      : Promise.resolve(null),
  { watch: [submittedQuery, page, allowed] },
)
watch(error, (err) => {
  if (err) notify.apiError(err, t('users.search.failed'))
})

const results = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const searched = computed(() => isSearchable(submittedQuery.value))

function submit(): void {
  const next = normalizeSearch(query.value)
  if (!isSearchable(next)) return
  if (next === submittedQuery.value) {
    void refresh()
    return
  }
  page.value = 1
  submittedQuery.value = next
}

function onPage(event: { page: number }): void {
  page.value = event.page + 1
}

function open(user: AdminUserSummary): void {
  void navigateTo(`/users/${encodeURIComponent(user.id)}`)
}

function formatDate(iso: string | null): string {
  return iso ? d(new Date(iso), 'short') : t('common.never')
}
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('users.title')"
      :subtitle="t('users.subtitle')"
      :crumbs="[{ label: t('nav.users') }]"
    />

    <LayoutForbidden v-if="!allowed" :hint="t('users.restricted')" />

    <div v-else class="flex flex-col gap-4">
      <form
        class="rounded-lg border border-surface-200 bg-surface-0 p-4"
        novalidate
        data-testid="users-search"
        @submit.prevent="submit"
      >
        <label for="users-q" class="text-sm font-medium">{{ t('users.search.label') }}</label>
        <div class="mt-1 flex flex-wrap gap-2">
          <IconField class="min-w-0 flex-1">
            <InputIcon class="pi pi-search" />
            <InputText
              id="users-q"
              v-model="query"
              :placeholder="t('users.search.placeholder')"
              autocomplete="off"
              autofocus
              fluid
            />
          </IconField>
          <Button
            type="submit"
            :label="t('common.search')"
            icon="pi pi-search"
            :loading="status === 'pending'"
            :disabled="!isSearchable(query)"
          />
        </div>
        <small class="mt-1 block text-xs text-muted-color">{{
          t('users.search.hint', { min: USER_SEARCH_MIN })
        }}</small>
      </form>

      <p v-if="!searched" class="py-8 text-center text-sm text-muted-color">
        {{ t('users.search.start') }}
      </p>

      <template v-else>
        <p class="text-sm text-muted-color">
          {{ t('users.search.results', { count: n(total) }, total) }}
        </p>
        <DataTable
          :value="results"
          :loading="status === 'pending'"
          data-key="id"
          striped-rows
          selection-mode="single"
          class="rounded-lg border border-surface-200 bg-surface-0"
          data-testid="users-table"
          @row-select="open($event.data)"
        >
          <template #empty>
            <div class="py-12 text-center">
              <i class="pi pi-users text-3xl text-muted-color" aria-hidden="true" />
              <p class="mt-3 text-sm text-muted-color">
                {{ t('users.search.empty', { q: submittedQuery }) }}
              </p>
            </div>
          </template>
          <Column :header="t('users.columns.user')">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <NuxtLink
                :to="`/users/${encodeURIComponent(row.id)}`"
                class="block font-medium hover:underline"
                >{{ userLabel(row) }}</NuxtLink
              >
              <span class="font-mono text-xs text-muted-color">{{ row.id }}</span>
            </template>
          </Column>
          <Column :header="t('users.columns.contact')">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <div class="text-sm">{{ row.email ?? '' }}</div>
              <div class="text-sm tabular-nums text-muted-color">{{ row.phone ?? '' }}</div>
            </template>
          </Column>
          <Column :header="t('users.columns.type')" class="w-28">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              {{ t(`users.type.${row.type}`) }}
            </template>
          </Column>
          <Column :header="t('users.columns.status')" class="w-40">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <Tag
                :value="t(`users.status.${row.status}`)"
                :severity="userStatusSeverity(row.status)"
              />
            </template>
          </Column>
          <Column :header="t('users.columns.country')" class="w-36">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <span v-if="row.country">{{ countryName(row.country, locale) }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column :header="t('users.columns.coins')" class="w-24 text-right">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <span v-if="summaryCoins(row) !== null" class="tabular-nums">{{
                n(summaryCoins(row) as number)
              }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column :header="t('users.columns.lastSeen')" class="w-44">
            <template #body="{ data: row }: { data: AdminUserSummary }">
              <span class="text-sm tabular-nums">{{ formatDate(row.lastSeenAt) }}</span>
            </template>
          </Column>
        </DataTable>
        <Paginator
          v-if="total > PAGE_SIZE"
          :rows="PAGE_SIZE"
          :total-records="total"
          :first="(page - 1) * PAGE_SIZE"
          @page="onPage"
        />
      </template>
    </div>
  </div>
</template>
