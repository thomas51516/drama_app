<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RewardTaskAdmin } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import { sortTasks, taskLabelKey, taskPeriod, weeklyTaskPotential } from '../../utils/rewards'

/** Tasks tab (B-08, M-41): fixed keys, editable coins / target / active per task. */
const { t, n } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()

const { data, status, error, refresh } = useAsyncData('admin-rewards-tasks', () => api.listTasks())
const { data: settings } = useAsyncData('admin-monetization-settings-for-tasks', () =>
  api.getSettings(),
)

const tasks = ref<RewardTaskAdmin[]>(sortTasks(data.value ?? []))
watch(data, (value) => {
  if (value) tasks.value = sortTasks(value)
})

const dialogVisible = ref(false)
const editing = ref<RewardTaskAdmin | null>(null)
const busyKey = ref<string | null>(null)

const activeCount = computed(() => tasks.value.filter((task) => task.isActive).length)
const weekly = computed(() => weeklyTaskPotential(tasks.value))
const bonusDays = computed(() => settings.value?.bonusValidityDays ?? 30)

function label(task: RewardTaskAdmin): string {
  const key = taskLabelKey(task.key)
  return key ? t(key) : task.title
}

function openEdit(task: RewardTaskAdmin): void {
  editing.value = task
  dialogVisible.value = true
}

function onSaved(saved: RewardTaskAdmin): void {
  tasks.value = sortTasks(tasks.value.map((task) => (task.key === saved.key ? saved : task)))
}

async function toggleActive(task: RewardTaskAdmin, isActive: boolean): Promise<void> {
  busyKey.value = task.key
  try {
    onSaved(await api.updateTask(task.key, { isActive }))
    notify.success(
      t(isActive ? 'rewards.tasks.toasts.activated' : 'rewards.tasks.toasts.deactivated', {
        task: label(task),
      }),
      t('monetization.audited'),
    )
  } catch (err) {
    notify.apiError(err, t('rewards.tasks.toasts.saveFailed'))
  } finally {
    busyKey.value = null
  }
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="tasks-panel">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('rewards.tasks.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">{{ t('rewards.tasks.hint') }}</p>
      </div>
      <div class="rounded-md bg-surface-100 px-4 py-2 text-sm">
        <div class="text-xs uppercase text-muted-color">{{ t('rewards.tasks.weekly') }}</div>
        <div class="text-xl font-semibold tabular-nums" data-testid="tasks-weekly">
          {{ t('rewards.checkin.coins', { count: n(weekly) }, weekly) }}
        </div>
        <div class="text-xs text-muted-color">
          {{ t('rewards.tasks.weeklyHint', { active: activeCount, days: bonusDays }) }}
        </div>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('rewards.tasks.loadError') }}</span>
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
      :value="tasks"
      :loading="status === 'pending' && tasks.length === 0"
      data-key="key"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-check-square text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('rewards.tasks.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('rewards.tasks.empty.hint') }}</p>
        </div>
      </template>

      <Column :header="t('rewards.tasks.columns.task')">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <div class="font-medium">{{ label(row) }}</div>
          <div class="text-xs text-muted-color">
            <code class="font-mono">{{ row.key }}</code>
            <span v-if="row.description"> · {{ row.description }}</span>
          </div>
        </template>
      </Column>
      <Column :header="t('rewards.tasks.columns.period')" class="w-32">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <Tag :value="t(`rewards.tasks.period.${taskPeriod(row)}`)" severity="secondary" />
        </template>
      </Column>
      <Column :header="t('rewards.tasks.columns.target')" class="w-28 text-right">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <span class="tabular-nums">{{ n(row.target) }}</span>
        </template>
      </Column>
      <Column :header="t('rewards.tasks.columns.coins')" class="w-28 text-right">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <span class="font-medium tabular-nums text-primary">+{{ n(row.coins) }}</span>
        </template>
      </Column>
      <Column :header="t('rewards.tasks.columns.active')" class="w-24">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="busyKey === row.key"
            :aria-label="t('rewards.tasks.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-20">
        <template #body="{ data: row }: { data: RewardTaskAdmin }">
          <div class="flex justify-end">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('rewards.tasks.edit')"
              :title="t('rewards.tasks.edit')"
              :data-testid="`edit-task-${row.key}`"
              @click="openEdit(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Message severity="secondary" :closable="false" size="small">
      <i class="pi pi-info-circle mr-2" aria-hidden="true" />{{ t('rewards.tasks.serverNote') }}
    </Message>

    <RewardsTaskDialog v-model:visible="dialogVisible" :task="editing" @saved="onSaved" />
  </section>
</template>
