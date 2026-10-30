<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RewardTaskAdmin } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import {
  TASK_COINS_MAX,
  TASK_TARGET_MAX,
  taskLabelKey,
  taskPatch,
  taskToForm,
  validateTaskForm,
  type TaskFormErrors,
  type TaskFormValues,
} from '../../utils/rewards'

/** Edit a reward task (coins, target, active); the key and title belong to the backend. */
const props = defineProps<{ visible: boolean; task: RewardTaskAdmin | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; saved: [task: RewardTaskAdmin] }>()

const { t } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()

const form = ref<TaskFormValues>({ coins: 0, target: 1, isActive: true })
const errors = ref<TaskFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const title = computed(() => {
  if (!props.task) return ''
  const key = taskLabelKey(props.task.key)
  return key ? t(key) : props.task.title
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible || !props.task) return
    form.value = taskToForm(props.task)
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateTaskForm(values)
  },
  { deep: true },
)

function errorMessage(key: keyof TaskFormErrors): string | undefined {
  const code = errors.value[key]
  return code ? t(code, { max: key === 'coins' ? TASK_COINS_MAX : TASK_TARGET_MAX }) : undefined
}

async function save(): Promise<void> {
  if (!props.task) return
  submitted.value = true
  errors.value = validateTaskForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const patch = taskPatch(form.value, props.task)
  if (Object.keys(patch).length === 0) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = await api.updateTask(props.task.key, patch)
    notify.success(
      t('rewards.tasks.toasts.saved', { task: title.value }),
      t('monetization.audited'),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('rewards.tasks.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('rewards.tasks.edit')"
    :style="{ width: 'min(32rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form
      v-if="task"
      class="flex flex-col gap-5"
      novalidate
      data-testid="task-form"
      @submit.prevent="save"
    >
      <div>
        <p class="font-medium">{{ title }}</p>
        <p class="text-xs text-muted-color">
          <code class="font-mono">{{ task.key }}</code>
          <span v-if="task.description"> · {{ task.description }}</span>
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="task-target" class="text-sm font-medium">{{
            t('rewards.tasks.form.target')
          }}</label>
          <InputNumber
            v-model="form.target"
            input-id="task-target"
            :min="1"
            :max="TASK_TARGET_MAX"
            :use-grouping="false"
            show-buttons
            :invalid="Boolean(errors.target)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.target" class="text-xs text-red-600">{{
            errorMessage('target')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t('rewards.tasks.form.targetHint')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="task-coins" class="text-sm font-medium">{{
            t('rewards.tasks.form.coins')
          }}</label>
          <InputNumber
            v-model="form.coins"
            input-id="task-coins"
            :min="0"
            :max="TASK_COINS_MAX"
            :use-grouping="false"
            show-buttons
            :invalid="Boolean(errors.coins)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.coins" class="text-xs text-red-600">{{
            errorMessage('coins')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t('rewards.tasks.form.coinsHint')
          }}</small>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="task-active" :disabled="saving" />
        <label for="task-active" class="text-sm">{{ t('rewards.tasks.form.active') }}</label>
      </div>

      <div class="flex justify-end gap-2">
        <Button
          type="button"
          :label="t('common.cancel')"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="emit('update:visible', false)"
        />
        <Button
          type="submit"
          :label="t('common.save')"
          icon="pi pi-check"
          :loading="saving"
          data-testid="save-task"
        />
      </div>
    </form>
  </Dialog>
</template>
