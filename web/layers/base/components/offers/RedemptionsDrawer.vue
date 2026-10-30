<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Paginated, PromoCode, PromoRedemption } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import { ApiError } from '../../utils/api-error'
import { formatZoned } from '../../utils/schedule'
import { shortId } from '../../utils/users'

/** Right-hand drawer listing who redeemed a promo code (paginated, 20 per page). */
const props = defineProps<{ visible: boolean; promo: PromoCode | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t, n, locale } = useI18n()
const api = useOffersApi()
const notify = useNotify()

const page = ref(1)
const result = ref<Paginated<PromoRedemption> | null>(null)
const loading = ref(false)
const failed = ref(false)

async function load(): Promise<void> {
  if (!props.promo) return
  loading.value = true
  failed.value = false
  try {
    result.value = await api.listRedemptions(props.promo.id, page.value)
  } catch (err) {
    failed.value = true
    if (!(ApiError.is(err) && err.status === 403)) notify.apiError(err, t('offers.loadError'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.promo?.id] as const,
  ([visible]) => {
    if (!visible) return
    page.value = 1
    result.value = null
    void load()
  },
)

function onPage(event: { page: number }): void {
  page.value = event.page + 1
  void load()
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    class="!w-full sm:!w-[32rem]"
    :header="t('offers.promo.redemptions')"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="promo" class="flex flex-col gap-4" data-testid="redemptions-drawer">
      <div>
        <code class="font-mono text-lg font-semibold">{{ promo.code }}</code>
        <p class="text-sm text-muted-color">
          {{
            t(
              'offers.promo.redemptionsSummary',
              { count: result?.total ?? promo.usesCount, coins: n(promo.coins) },
              result?.total ?? promo.usesCount,
            )
          }}
        </p>
      </div>

      <Message v-if="failed" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('offers.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="load"
          />
        </div>
      </Message>

      <DataTable
        v-else
        :value="result?.items ?? []"
        :loading="loading"
        data-key="id"
        lazy
        paginator
        :rows="result?.pageSize ?? 20"
        :total-records="result?.total ?? 0"
        :first="((result?.page ?? 1) - 1) * (result?.pageSize ?? 20)"
        class="rounded-lg border border-surface-200 bg-surface-0"
        @page="onPage"
      >
        <template #empty>
          <p class="py-8 text-center text-sm text-muted-color">
            {{ t('offers.promo.noRedemptions') }}
          </p>
        </template>
        <Column :header="t('offers.promo.columns.user')">
          <template #body="{ data: row }: { data: PromoRedemption }">
            <NuxtLink :to="`/users/${row.userId}`" class="text-primary hover:underline">
              {{ row.userLabel || shortId(row.userId) }}
            </NuxtLink>
          </template>
        </Column>
        <Column :header="t('offers.promo.columns.coins')" class="w-24 text-right">
          <template #body="{ data: row }: { data: PromoRedemption }">
            <span class="tabular-nums text-primary">+{{ n(row.coins) }}</span>
          </template>
        </Column>
        <Column :header="t('offers.promo.columns.redeemedAt')" class="w-44">
          <template #body="{ data: row }: { data: PromoRedemption }">
            <span class="text-sm">{{ formatZoned(row.redeemedAt, locale) }}</span>
          </template>
        </Column>
      </DataTable>
    </div>
  </Drawer>
</template>
