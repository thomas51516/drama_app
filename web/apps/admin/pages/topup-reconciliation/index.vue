<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TopupReconciliationMismatch } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { canManageMonetization } from '#base/utils/monetization'
import {
  dateToParam,
  formatAmounts,
  isReconciled,
  isReconciliationDate,
  mismatchAmountLabel,
  mismatchReasonKey,
  paramToDate,
  reconciliationCsvFilename,
  reconciliationTiles,
  reconciliationToCsv,
  todayReconciliationDate,
} from '#base/utils/reconciliation'
import { formatZoned } from '#base/utils/schedule'
import { shortId } from '#base/utils/users'

/**
 * B-11 — daily reconciliation of mobile money top-ups (contract v1.5): orders vs payments vs
 * credited coins for a Lomé civil day, the mismatches found and a CSV export.
 */
const { t, n, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const api = useTopupApi()
const notify = useNotify()

const allowed = computed(() => canManageMonetization(auth.user?.role))

const date = ref<string>(
  isReconciliationDate(route.query.date) ? route.query.date : todayReconciliationDate(),
)
const picker = ref<Date | null>(paramToDate(date.value))
const today = todayReconciliationDate()
const maxDate = paramToDate(today)

watch(picker, (value) => {
  const next = dateToParam(value)
  if (next && next !== date.value) date.value = next
})
watch(date, (value) => {
  void router.replace({ query: { ...route.query, date: value === today ? undefined : value } })
})

const {
  data: report,
  status,
  error,
  refresh,
} = useAsyncData(
  () => `admin-topup-reconciliation-${date.value}`,
  () => (allowed.value ? api.reconciliation(date.value) : Promise.resolve(null)),
  { watch: [date], default: () => null },
)

const loading = computed(() => status.value === 'pending')
const forbidden = computed(() => ApiError.is(error.value) && error.value.status === 403)
const tiles = computed(() => reconciliationTiles(report.value))
const reconciled = computed(() => isReconciled(report.value))

function shiftDay(days: number): void {
  const current = paramToDate(date.value) ?? new Date()
  current.setDate(current.getDate() + days)
  const next = dateToParam(current)
  if (next && next <= today) picker.value = current
}

function reasonLabel(mismatch: TopupReconciliationMismatch): string {
  const key = mismatchReasonKey(mismatch.reason)
  return key ? t(key) : mismatch.reason
}

function exportCsv(): void {
  if (!report.value) return
  const csv = reconciliationToCsv(report.value)
  // UTF-8 BOM so Excel opens accents correctly (escape avoids an "irregular whitespace" lint).
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reconciliationCsvFilename(report.value.date)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  notify.success(t('reconciliation.exported', { count: report.value.mismatches.length }))
}

const tileSeverityClass: Record<string, string> = {
  neutral: 'border-surface-200',
  ok: 'border-green-200 bg-green-50/40',
  warn: 'border-amber-300 bg-amber-50/40',
  danger: 'border-red-300 bg-red-50/40',
}
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('reconciliation.title')"
      :subtitle="t('reconciliation.subtitle')"
      :crumbs="[
        { label: t('dashboard.title'), to: '/dashboard' },
        { label: t('nav.topupReconciliation') },
      ]"
    >
      <template #actions>
        <Button
          icon="pi pi-download"
          :label="t('reconciliation.exportCsv')"
          severity="secondary"
          outlined
          :disabled="!report"
          data-testid="export-csv"
          @click="exportCsv"
        />
        <Button
          icon="pi pi-refresh"
          :label="t('common.refresh')"
          severity="secondary"
          outlined
          :loading="loading"
          @click="refresh()"
        />
      </template>
    </LayoutPageHeader>

    <LayoutForbidden v-if="!allowed || forbidden" :hint="t('reconciliation.restricted')" />

    <div v-else class="flex flex-col gap-6">
      <!-- Day picker -->
      <div
        class="flex flex-wrap items-end gap-3 rounded-lg border border-surface-200 bg-surface-0 p-4"
      >
        <div class="flex flex-col gap-1">
          <label for="reconciliation-date" class="text-sm font-medium">{{
            t('reconciliation.day')
          }}</label>
          <div class="flex items-center gap-1">
            <Button
              icon="pi pi-chevron-left"
              severity="secondary"
              text
              :aria-label="t('reconciliation.previousDay')"
              @click="shiftDay(-1)"
            />
            <DatePicker
              v-model="picker"
              input-id="reconciliation-date"
              date-format="dd/mm/yy"
              show-icon
              :max-date="maxDate ?? undefined"
              :manual-input="false"
            />
            <Button
              icon="pi pi-chevron-right"
              severity="secondary"
              text
              :disabled="date >= today"
              :aria-label="t('reconciliation.nextDay')"
              @click="shiftDay(1)"
            />
          </div>
        </div>
        <Button
          :label="t('reconciliation.today')"
          severity="secondary"
          outlined
          size="small"
          :disabled="date === today"
          @click="picker = paramToDate(today)"
        />
        <p class="text-xs text-muted-color sm:ml-auto">{{ t('reconciliation.timezoneNote') }}</p>
      </div>

      <Message v-if="error" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('reconciliation.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refresh()"
          />
        </div>
      </Message>

      <!-- Counters -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="reconciliation-tiles">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="rounded-lg border bg-surface-0 p-4"
          :class="tileSeverityClass[tile.severity]"
        >
          <div class="text-xs font-medium uppercase text-muted-color">
            {{ t(`reconciliation.tiles.${tile.key}`) }}
          </div>
          <div class="mt-1 text-3xl font-semibold tabular-nums">
            {{ report ? n(tile.value) : '—' }}
          </div>
          <div class="mt-1 text-xs text-muted-color">
            <template v-if="tile.ratio !== null">
              {{
                t(`reconciliation.ratios.${tile.key}`, {
                  percent: n(tile.ratio, { style: 'percent', maximumFractionDigits: 0 }),
                })
              }}
            </template>
            <template v-else-if="tile.key === 'orders' && report?.amounts?.length">
              {{
                t('reconciliation.amountPaid', { amount: formatAmounts(report.amounts, locale) })
              }}
            </template>
            <template v-else-if="tile.key === 'mismatches'">
              {{
                tile.value === 0 ? t('reconciliation.noMismatch') : t('reconciliation.hasMismatch')
              }}
            </template>
          </div>
        </div>
      </div>

      <Message
        v-if="report && reconciled"
        severity="success"
        :closable="false"
        data-testid="reconciled"
      >
        <i class="pi pi-check-circle mr-2" aria-hidden="true" />{{
          t('reconciliation.allGood', { date })
        }}
      </Message>
      <Message v-else-if="report" severity="warn" :closable="false">
        <i class="pi pi-exclamation-triangle mr-2" aria-hidden="true" />{{
          t(
            'reconciliation.mismatchHint',
            { count: report.mismatches.length },
            report.mismatches.length,
          )
        }}
      </Message>

      <!-- Mismatches -->
      <DataTable
        :value="report?.mismatches ?? []"
        :loading="loading && !report"
        data-key="orderId"
        striped-rows
        class="rounded-lg border border-surface-200 bg-surface-0"
        data-testid="mismatches-table"
      >
        <template #empty>
          <div class="py-10 text-center">
            <i class="pi pi-check-circle text-3xl text-green-600" aria-hidden="true" />
            <p class="mt-3 font-medium">{{ t('reconciliation.empty.title') }}</p>
            <p class="mt-1 text-sm text-muted-color">{{ t('reconciliation.empty.hint') }}</p>
          </div>
        </template>
        <Column :header="t('reconciliation.columns.order')">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <code class="font-mono text-sm">{{ row.orderId }}</code>
            <div v-if="row.createdAt" class="text-xs text-muted-color">
              {{ formatZoned(row.createdAt, locale) }}
            </div>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.user')" class="w-40">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <NuxtLink
              v-if="row.userId"
              :to="`/users/${row.userId}`"
              class="text-primary hover:underline"
            >
              {{ shortId(row.userId) }}
            </NuxtLink>
            <span v-else>—</span>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.pack')" class="w-36">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <span class="font-mono text-sm">{{ row.packSku ?? '—' }}</span>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.amount')" class="w-32 text-right">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <span class="tabular-nums">{{ mismatchAmountLabel(row, locale) }}</span>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.status')" class="w-40">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <div class="text-sm">{{ row.status ?? '—' }}</div>
            <div v-if="row.providerStatus" class="text-xs text-muted-color">
              {{ t('reconciliation.provider') }} : {{ row.providerStatus }}
            </div>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.coins')" class="w-36 text-right">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <span class="tabular-nums">
              {{ row.coinsCredited ?? '—' }} / {{ row.coinsExpected ?? '—' }}
            </span>
          </template>
        </Column>
        <Column :header="t('reconciliation.columns.reason')">
          <template #body="{ data: row }: { data: TopupReconciliationMismatch }">
            <Tag :value="reasonLabel(row)" severity="danger" />
          </template>
        </Column>
      </DataTable>

      <p v-if="report?.generatedAt" class="text-xs text-muted-color">
        {{ t('dashboard.generatedAt', { date: formatZoned(report.generatedAt, locale) }) }}
      </p>
    </div>
  </div>
</template>
