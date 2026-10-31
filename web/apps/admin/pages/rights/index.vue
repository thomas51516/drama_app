<script setup lang="ts">
import { computed, ref } from 'vue'
import { ApiError } from '#base/utils/api-error'
import { decorateRenewalRows, type RightsRenewalRow } from '#base/utils/rights'

/**
 * Droits et contrats (B-12, sprint 9): every series with its computed rights status, and an
 * "expiring soon" filter mirroring the backend's `expiringWithinDays` exactly.
 */
const EXPIRING_WITHIN_DAYS = 30

const { t, d } = useI18n()
const api = useRightsApi()

const expiringOnly = ref(false)

const {
  data: list,
  status,
  error,
  refresh,
} = await useAsyncData(
  () => `admin-rights-contracts-${expiringOnly.value}`,
  () => api.listContracts(expiringOnly.value ? { expiringWithinDays: EXPIRING_WITHIN_DAYS } : {}),
  { watch: [expiringOnly], default: () => null },
)

const loading = computed(() => status.value === 'pending')
const forbidden = computed(() => ApiError.is(error.value) && error.value.status === 403)
const rows = computed<RightsRenewalRow[]>(() => decorateRenewalRows(list.value?.items ?? []))
</script>

<template>
  <div>
    <LayoutPageHeader :title="t('rights.title')" :subtitle="t('rights.subtitle')" />

    <LayoutForbidden v-if="forbidden" />

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <ToggleButton
          v-model="expiringOnly"
          :on-label="t('rights.filters.expiringSoon')"
          :off-label="t('rights.filters.expiringSoon')"
          on-icon="pi pi-filter"
          off-icon="pi pi-filter"
        />
        <Button
          v-if="expiringOnly"
          :label="t('rights.filters.reset')"
          icon="pi pi-filter-slash"
          text
          size="small"
          @click="expiringOnly = false"
        />
      </div>

      <Message v-if="error" severity="error" :closable="false" class="mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('rights.loadError') }}</span>
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
        :value="rows"
        :loading="loading"
        data-key="seriesId"
        striped-rows
        :row-hover="true"
        class="rounded-lg border border-surface-200 bg-surface-0"
      >
        <template #header>
          <div class="text-sm text-muted-color">
            {{ t('rights.count', { count: rows.length }, rows.length) }}
          </div>
        </template>

        <template #empty>
          <div class="py-12 text-center">
            <i class="pi pi-inbox text-3xl text-muted-color" aria-hidden="true" />
            <p class="mt-3 font-medium">{{ t('rights.empty.title') }}</p>
            <p v-if="expiringOnly" class="mt-1 text-sm text-muted-color">
              {{ t('rights.empty.filtered') }}
            </p>
          </div>
        </template>

        <Column :header="t('rights.columns.series')">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <NuxtLink :to="`/series/${row.seriesId}`" class="font-medium hover:underline">
              {{ row.seriesTitle }}
            </NuxtLink>
          </template>
        </Column>

        <Column :header="t('rights.columns.seriesStatus')" class="w-32">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <CatalogueSeriesStatusTag :status="row.seriesStatus" />
          </template>
        </Column>

        <Column :header="t('rights.columns.rightsStatus')" class="w-32">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <RightsStatusTag :status="row.rightsStatus" />
          </template>
        </Column>

        <Column :header="t('rights.columns.rightsHolder')">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <span v-if="row.contract">{{ row.contract.rightsHolder }}</span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>

        <Column :header="t('rights.columns.territories')" class="w-40">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <span v-if="!row.contract" class="text-muted-color">—</span>
            <span v-else-if="row.contract.territories.length === 0">
              {{ t('rights.territoriesWorldwide') }}
            </span>
            <span v-else>{{ row.contract.territories.join(', ') }}</span>
          </template>
        </Column>

        <Column :header="t('rights.columns.licenseEndsAt')" class="w-44">
          <template #body="{ data: row }: { data: RightsRenewalRow }">
            <span v-if="!row.contract" class="text-muted-color">—</span>
            <span v-else-if="!row.contract.licenseEndsAt">{{ t('rights.licenseIndefinite') }}</span>
            <time v-else :datetime="row.contract.licenseEndsAt">
              {{ d(new Date(row.contract.licenseEndsAt), 'long') }}
            </time>
          </template>
        </Column>
      </DataTable>
    </template>
  </div>
</template>
