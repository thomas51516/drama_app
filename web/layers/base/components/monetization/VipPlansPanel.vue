<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Price, VipPlanAdmin } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import { formatPrice, sortVipPlans } from '../../utils/monetization'

/** VIP plans tab (B-06): table by period, inline activation, create / edit / delete. */
const { t, locale } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-monetization-vip-plans', () =>
  api.listVipPlans(),
)
const plans = ref<VipPlanAdmin[]>(sortVipPlans(data.value ?? []))
watch(data, (value) => {
  if (value) plans.value = sortVipPlans(value)
})

const dialogVisible = ref(false)
const editing = ref<VipPlanAdmin | null>(null)
const busyId = ref<string | null>(null)

const activeCount = computed(() => plans.value.filter((plan) => plan.isActive).length)

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(plan: VipPlanAdmin): void {
  editing.value = plan
  dialogVisible.value = true
}

function onSaved(saved: VipPlanAdmin): void {
  const exists = plans.value.some((plan) => plan.id === saved.id)
  plans.value = sortVipPlans(
    exists
      ? plans.value.map((plan) => (plan.id === saved.id ? saved : plan))
      : [...plans.value, saved],
  )
}

function pricesLabel(prices: Price[]): string {
  return prices.map((price) => formatPrice(price, locale.value)).join(' · ')
}

async function toggleActive(plan: VipPlanAdmin, isActive: boolean): Promise<void> {
  busyId.value = plan.id
  try {
    onSaved(await api.updateVipPlan(plan.id, { isActive }))
    notify.success(
      t(isActive ? 'monetization.toasts.activated' : 'monetization.toasts.deactivated'),
    )
  } catch (err) {
    notify.apiError(err, t('monetization.toasts.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(plan: VipPlanAdmin): void {
  confirm.require({
    header: t('monetization.vip.delete'),
    message: t('monetization.vip.deleteConfirm', { sku: plan.sku }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(plan),
  })
}

async function remove(plan: VipPlanAdmin): Promise<void> {
  busyId.value = plan.id
  try {
    await api.deleteVipPlan(plan.id)
    plans.value = plans.value.filter((item) => item.id !== plan.id)
    notify.success(t('monetization.toasts.planDeleted'))
  } catch (err) {
    notify.apiError(err, t('monetization.toasts.deleteFailed'))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="vip-panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-color">
        {{
          t('monetization.vip.summary', { count: plans.length, active: activeCount }, plans.length)
        }}
      </p>
      <Button
        :label="t('monetization.vip.create')"
        icon="pi pi-plus"
        size="small"
        data-testid="create-vip"
        @click="openCreate"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('monetization.loadError') }}</span>
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
      :value="plans"
      :loading="status === 'pending' && plans.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-crown text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('monetization.vip.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('monetization.vip.empty.hint') }}</p>
        </div>
      </template>

      <Column :header="t('monetization.vip.columns.sku')">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          <span class="font-mono text-sm">{{ row.sku }}</span>
          <Tag v-if="row.badge" :value="row.badge" severity="info" class="ml-2" />
        </template>
      </Column>
      <Column :header="t('monetization.vip.columns.period')" class="w-36">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          {{ t(`monetization.period.${row.period}`) }}
        </template>
      </Column>
      <Column :header="t('monetization.vip.columns.trial')" class="w-32">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          <span v-if="row.trialDays > 0">{{
            t('monetization.vip.trialDaysValue', { count: row.trialDays }, row.trialDays)
          }}</span>
          <span v-else class="text-muted-color">{{ t('monetization.vip.noTrial') }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.vip.columns.prices')">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          <span class="text-sm tabular-nums">{{ pricesLabel(row.prices) }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.vip.columns.active')" class="w-24">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="busyId === row.id"
            :aria-label="t('monetization.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: VipPlanAdmin }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('monetization.vip.edit')"
              :title="t('monetization.vip.edit')"
              @click="openEdit(row)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :loading="busyId === row.id"
              :aria-label="t('monetization.vip.delete')"
              :title="t('monetization.vip.delete')"
              @click="askDelete(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <MonetizationVipPlanDialog v-model:visible="dialogVisible" :plan="editing" @saved="onSaved" />
  </div>
</template>
