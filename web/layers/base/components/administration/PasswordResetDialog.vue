<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminAccount } from '../../types/api'
import { useAdministrationApi } from '../../composables/useAdministrationApi'
import { useNotify } from '../../composables/useNotify'
import { PASSWORD_MIN_LENGTH, generatePassword, passwordProblems } from '../../utils/accounts'

/** Reset the password of an account (B-13): generated or typed, confirmed, shown once afterwards. */
const props = defineProps<{
  visible: boolean
  account: AdminAccount | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  reset: [account: AdminAccount, password: string]
}>()

const { t } = useI18n()
const api = useAdministrationApi()
const notify = useNotify()

const generate = ref(true)
const password = ref('')
const saving = ref(false)
const submitted = ref(false)
const problem = computed(() => passwordProblems(password.value)[0] ?? null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    generate.value = true
    password.value = generatePassword()
    submitted.value = false
  },
)
watch(generate, (value) => {
  password.value = value ? generatePassword() : ''
})

async function save(): Promise<void> {
  if (!props.account) return
  submitted.value = true
  if (problem.value) {
    notify.warn(t(problem.value, { min: PASSWORD_MIN_LENGTH }))
    return
  }
  saving.value = true
  try {
    await api.resetPassword(props.account.id, password.value)
    notify.success(t('administration.toasts.passwordReset', { email: props.account.email }))
    emit('reset', props.account, password.value)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('administration.toasts.passwordResetFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('administration.accounts.resetPassword')"
    :style="{ width: 'min(30rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form v-if="account" class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <p class="text-sm">
        {{ t('administration.accounts.resetPasswordHint', { email: account.email }) }}
      </p>
      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="generate" input-id="reset-generate" :disabled="saving" />
        <label for="reset-generate" class="text-sm">{{
          t('administration.password.generate')
        }}</label>
      </div>
      <div class="flex items-center gap-2">
        <InputText
          v-if="generate"
          :model-value="password"
          readonly
          class="flex-1 font-mono"
          :aria-label="t('administration.password.generated')"
        />
        <Password
          v-else
          v-model="password"
          input-id="reset-password"
          toggle-mask
          :feedback="false"
          autocomplete="new-password"
          :invalid="submitted && Boolean(problem)"
          :disabled="saving"
          fluid
          class="flex-1"
          :aria-label="t('administration.password.typed')"
        />
        <Button
          v-if="generate"
          type="button"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :aria-label="t('administration.password.regenerate')"
          @click="password = generatePassword()"
        />
      </div>
      <small v-if="submitted && problem" class="text-red-600">{{
        t(problem, { min: PASSWORD_MIN_LENGTH })
      }}</small>
      <small v-else class="text-xs text-muted-color">
        {{ t('administration.password.policy', { min: PASSWORD_MIN_LENGTH }) }}
      </small>
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
          :label="t('administration.accounts.resetPasswordAction')"
          severity="danger"
          icon="pi pi-key"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>
