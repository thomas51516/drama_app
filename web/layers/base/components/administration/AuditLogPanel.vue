<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminAccount, AuditLog } from '../../types/api'
import { useAdministrationApi } from '../../composables/useAdministrationApi'
import { AUDIT_TARGET_TYPES, actionSeverity } from '../../utils/audit-diff'

/** Audit log tab (B-13): paginated table with filters and an expandable diff per line. */
const { t, d } = useI18n()
const api = useAdministrationApi()

const PAGE_SIZE = 20
const page = ref(1)
const actorId = ref<string | null>(null)
const action = ref('')
const debouncedAction = ref('')
const targetType = ref<string | null>(null)
const targetId = ref('')
const debouncedTargetId = ref('')
const range = ref<(Date | null)[] | null>(null)
const expandedRows = ref<Record<string, boolean>>({})

let timer: ReturnType<typeof setTimeout> | null = null
watch([action, targetId], ([nextAction, nextTarget]) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    debouncedAction.value = nextAction.trim()
    debouncedTargetId.value = nextTarget.trim()
    page.value = 1
  }, 300)
})
watch([actorId, targetType, range], () => {
  page.value = 1
})

const from = computed(() => {
  const start = range.value?.[0]
  return start ? new Date(start.setHours(0, 0, 0, 0)).toISOString() : undefined
})
const to = computed(() => {
  const end = range.value?.[1] ?? range.value?.[0]
  return end ? new Date(new Date(end).setHours(23, 59, 59, 999)).toISOString() : undefined
})

const { data: actors } = useAsyncData('admin-audit-actors', () => api.listAccounts())
const actorOptions = computed(() =>
  (actors.value ?? []).map((account: AdminAccount) => ({
    value: account.id,
    label: account.email,
  })),
)
const targetTypeOptions = AUDIT_TARGET_TYPES.map((value) => ({
  value,
  label: t(`administration.audit.targetTypes.${value}`),
}))

const { data, status, error, refresh } = useAsyncData(
  'admin-audit-logs',
  () =>
    api.listAuditLogs({
      page: page.value,
      pageSize: PAGE_SIZE,
      actorId: actorId.value ?? undefined,
      action: debouncedAction.value || undefined,
      targetType: targetType.value ?? undefined,
      targetId: debouncedTargetId.value || undefined,
      from: from.value,
      to: to.value,
    }),
  { watch: [page, actorId, debouncedAction, targetType, debouncedTargetId, from, to] },
)
const logs = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const loading = computed(() => status.value === 'pending')
const hasFilters = computed(() =>
  Boolean(actorId.value || action.value || targetType.value || targetId.value || range.value?.[0]),
)

function onPage(event: { page: number }): void {
  page.value = event.page + 1
}

function resetFilters(): void {
  actorId.value = null
  action.value = ''
  debouncedAction.value = ''
  targetType.value = null
  targetId.value = ''
  debouncedTargetId.value = ''
  range.value = null
  page.value = 1
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="grid gap-3 rounded-lg border border-surface-200 bg-surface-0 p-4 md:grid-cols-2 xl:grid-cols-5"
    >
      <div class="flex flex-col gap-1">
        <label for="audit-actor" class="text-xs font-medium text-muted-color">{{
          t('administration.audit.filters.actor')
        }}</label>
        <Select
          v-model="actorId"
          input-id="audit-actor"
          :options="actorOptions"
          option-label="label"
          option-value="value"
          show-clear
          filter
          :placeholder="t('administration.audit.filters.allActors')"
          fluid
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="audit-action" class="text-xs font-medium text-muted-color">{{
          t('administration.audit.filters.action')
        }}</label>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            id="audit-action"
            v-model="action"
            :placeholder="t('administration.audit.filters.actionPlaceholder')"
            fluid
          />
        </IconField>
      </div>
      <div class="flex flex-col gap-1">
        <label for="audit-target-type" class="text-xs font-medium text-muted-color">{{
          t('administration.audit.filters.targetType')
        }}</label>
        <Select
          v-model="targetType"
          input-id="audit-target-type"
          :options="targetTypeOptions"
          option-label="label"
          option-value="value"
          show-clear
          :placeholder="t('administration.audit.filters.allTargets')"
          fluid
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="audit-target-id" class="text-xs font-medium text-muted-color">{{
          t('administration.audit.filters.targetId')
        }}</label>
        <InputText
          id="audit-target-id"
          v-model="targetId"
          class="font-mono"
          :placeholder="t('administration.audit.filters.targetIdPlaceholder')"
          fluid
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="audit-range" class="text-xs font-medium text-muted-color">{{
          t('administration.audit.filters.period')
        }}</label>
        <DatePicker
          v-model="range"
          input-id="audit-range"
          selection-mode="range"
          :manual-input="false"
          show-icon
          show-button-bar
          date-format="dd/mm/yy"
          :placeholder="t('administration.audit.filters.periodPlaceholder')"
          fluid
        />
      </div>
      <div class="flex items-end justify-between gap-2 md:col-span-2 xl:col-span-5">
        <span class="text-sm text-muted-color">
          {{ t('administration.audit.count', { count: total }, total) }}
        </span>
        <Button
          v-if="hasFilters"
          :label="t('series.filters.reset')"
          icon="pi pi-filter-slash"
          size="small"
          text
          @click="resetFilters"
        />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('administration.audit.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <DataTable
      v-model:expanded-rows="expandedRows"
      :value="logs"
      :loading="loading"
      data-key="id"
      lazy
      paginator
      :rows="PAGE_SIZE"
      :total-records="total"
      :first="(page - 1) * PAGE_SIZE"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
      @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-history text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('administration.audit.empty') }}</p>
        </div>
      </template>
      <Column expander class="w-10" />
      <Column :header="t('administration.audit.columns.date')" class="w-44">
        <template #body="{ data: row }: { data: AuditLog }">
          <time :datetime="row.createdAt" class="tabular-nums">{{
            d(new Date(row.createdAt), 'long')
          }}</time>
        </template>
      </Column>
      <Column :header="t('administration.audit.columns.actor')">
        <template #body="{ data: row }: { data: AuditLog }">
          <span v-if="row.actorEmail">{{ row.actorEmail }}</span>
          <span v-else class="italic text-muted-color">{{ t('administration.audit.system') }}</span>
        </template>
      </Column>
      <Column :header="t('administration.audit.columns.action')" class="w-56">
        <template #body="{ data: row }: { data: AuditLog }">
          <Tag :value="row.action" :severity="actionSeverity(row.action)" class="font-mono" />
        </template>
      </Column>
      <Column :header="t('administration.audit.columns.target')">
        <template #body="{ data: row }: { data: AuditLog }">
          <span class="text-sm">{{
            t(`administration.audit.targetTypes.${row.targetType}`, row.targetType)
          }}</span>
          <p
            v-if="row.targetId"
            class="truncate font-mono text-xs text-muted-color"
            :title="row.targetId"
          >
            {{ row.targetId }}
          </p>
        </template>
      </Column>
      <template #expansion="{ data: row }: { data: AuditLog }">
        <AdministrationAuditDiff :log="row" />
      </template>
    </DataTable>
  </div>
</template>
