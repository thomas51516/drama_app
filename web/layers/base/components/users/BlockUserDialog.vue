<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AppUser } from '../../types/api'
import { useUsersApi } from '../../composables/useUsersApi'
import { useNotify } from '../../composables/useNotify'
import {
  ADJUSTMENT_REASON_MAX,
  ADJUSTMENT_REASON_MIN,
  userErrorKey,
  userLabel,
  validateReason,
} from '../../utils/users'

/** « Bloquer / Débloquer » (B-09) with a mandatory, audited reason. */
const props = defineProps<{
  visible: boolean
  user: AppUser
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: [user: AppUser]
}>()

const { t } = useI18n()
const api = useUsersApi()
const notify = useNotify()
const confirm = useConfirm()

const reason = ref('')
const error = ref<string | undefined>()
const submitted = ref(false)
const saving = ref(false)

const unblocking = computed(() => props.user.status === 'BLOCKED')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    reason.value = ''
    error.value = undefined
    submitted.value = false
  },
)
watch(reason, (value) => {
  if (submitted.value) error.value = validateReason(value)
})

function askConfirm(): void {
  submitted.value = true
  error.value = validateReason(reason.value)
  if (error.value) return
  confirm.require({
    header: unblocking.value ? t('users.block.unblockTitle') : t('users.block.title'),
    message: t(unblocking.value ? 'users.block.confirmUnblock' : 'users.block.confirmBlock', {
      user: userLabel(props.user),
    }),
    icon: unblocking.value ? 'pi pi-lock-open' : 'pi pi-ban',
    acceptLabel: unblocking.value ? t('users.actions.unblock') : t('users.actions.block'),
    rejectLabel: t('common.cancel'),
    acceptProps: unblocking.value ? undefined : { severity: 'danger' },
    accept: () => void save(),
  })
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const input = { reason: reason.value.trim() }
    const user = unblocking.value
      ? await api.unblockUser(props.user.id, input)
      : await api.blockUser(props.user.id, input)
    notify.success(t(unblocking.value ? 'users.block.unblocked' : 'users.block.blocked'))
    emit('changed', user)
    emit('update:visible', false)
  } catch (err) {
    const key = userErrorKey(err)
    if (key) notify.error(t('users.block.failed'), t(key))
    else notify.apiError(err, t('users.block.failed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="unblocking ? t('users.block.unblockTitle') : t('users.block.title')"
    :style="{ width: 'min(32rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      data-testid="block-form"
      @submit.prevent="askConfirm"
    >
      <Message :severity="unblocking ? 'info' : 'warn'" :closable="false" size="small">
        {{ unblocking ? t('users.block.unblockHint') : t('users.block.hint') }}
      </Message>
      <p class="text-sm font-medium">{{ userLabel(user) }}</p>
      <div class="flex flex-col gap-1">
        <label for="block-reason" class="text-sm font-medium">{{ t('users.block.reason') }}</label>
        <Textarea
          id="block-reason"
          v-model="reason"
          rows="3"
          :maxlength="ADJUSTMENT_REASON_MAX"
          :placeholder="t('users.block.reasonPlaceholder')"
          :invalid="Boolean(error)"
          :disabled="saving"
          autofocus
          auto-resize
          fluid
        />
        <small v-if="error" class="text-xs text-red-600">{{
          t(error, { max: ADJUSTMENT_REASON_MAX })
        }}</small>
        <small v-else class="text-xs text-muted-color">{{
          t('users.adjust.reasonHint', { min: ADJUSTMENT_REASON_MIN })
        }}</small>
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
          :label="unblocking ? t('users.actions.unblock') : t('users.actions.block')"
          :icon="unblocking ? 'pi pi-lock-open' : 'pi pi-ban'"
          :severity="unblocking ? undefined : 'danger'"
          :loading="saving"
          data-testid="submit-block"
        />
      </div>
    </form>
  </Dialog>
</template>
