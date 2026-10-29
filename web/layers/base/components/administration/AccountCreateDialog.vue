<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AdminAccount } from '../../types/api'
import { ADMIN_ROLES } from '../../types/api'
import { useAdministrationApi } from '../../composables/useAdministrationApi'
import { useNotify } from '../../composables/useNotify'
import {
  PASSWORD_MIN_LENGTH,
  emptyAccountForm,
  generatePassword,
  validateAccountForm,
  type AccountFormErrors,
} from '../../utils/accounts'

/**
 * Create an internal account (B-13). The password is generated (default) or typed; it is
 * shown once to the admin after creation (`created` event) and never again.
 */
const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: [account: AdminAccount, password: string]
}>()

const { t } = useI18n()
const api = useAdministrationApi()
const notify = useNotify()

const form = ref(emptyAccountForm())
const generate = ref(true)
const errors = ref<AccountFormErrors>({})
const submitted = ref(false)
const saving = ref(false)
const roleOptions = ADMIN_ROLES.map((value) => ({ value, label: t(`auth.roles.${value}`) }))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = { ...emptyAccountForm(), password: generatePassword() }
    generate.value = true
    errors.value = {}
    submitted.value = false
  },
)

watch(generate, (value) => {
  form.value.password = value ? generatePassword() : ''
})

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateAccountForm(values)
  },
  { deep: true },
)

function regenerate(): void {
  form.value.password = generatePassword()
}

function message(key: keyof AccountFormErrors): string | undefined {
  const code = errors.value[key]
  return code ? t(code, { min: PASSWORD_MIN_LENGTH, max: 80 }) : undefined
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateAccountForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  saving.value = true
  try {
    const account = await api.createAccount({
      email: form.value.email.trim().toLowerCase(),
      displayName: form.value.displayName.trim(),
      role: form.value.role,
      password: form.value.password,
    })
    notify.success(t('administration.toasts.created', { email: account.email }))
    emit('created', account, form.value.password)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('administration.toasts.createFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('administration.accounts.create')"
    :style="{ width: 'min(32rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="account-email" class="text-sm font-medium">{{
          t('administration.accounts.columns.email')
        }}</label>
        <InputText
          id="account-email"
          v-model="form.email"
          type="email"
          autocomplete="off"
          :invalid="Boolean(errors.email)"
          :disabled="saving"
          fluid
        />
        <small v-if="errors.email" class="text-red-600">{{ message('email') }}</small>
      </div>
      <div class="flex flex-col gap-1">
        <label for="account-name" class="text-sm font-medium">{{
          t('administration.accounts.columns.displayName')
        }}</label>
        <InputText
          id="account-name"
          v-model="form.displayName"
          maxlength="80"
          autocomplete="off"
          :invalid="Boolean(errors.displayName)"
          :disabled="saving"
          fluid
        />
        <small v-if="errors.displayName" class="text-red-600">{{ message('displayName') }}</small>
      </div>
      <div class="flex flex-col gap-1">
        <label for="account-role" class="text-sm font-medium">{{
          t('administration.accounts.columns.role')
        }}</label>
        <Select
          v-model="form.role"
          input-id="account-role"
          :options="roleOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          fluid
        />
        <small class="text-xs text-muted-color">{{
          t(`administration.roleHints.${form.role}`)
        }}</small>
      </div>

      <fieldset class="flex flex-col gap-2 rounded-md bg-surface-50 p-3">
        <legend class="px-1 text-sm font-medium">{{ t('administration.password.title') }}</legend>
        <div class="flex items-center gap-3">
          <ToggleSwitch v-model="generate" input-id="account-generate" :disabled="saving" />
          <label for="account-generate" class="text-sm">{{
            t('administration.password.generate')
          }}</label>
        </div>
        <div class="flex items-center gap-2">
          <InputText
            v-if="generate"
            :model-value="form.password"
            readonly
            class="flex-1 font-mono"
            :aria-label="t('administration.password.generated')"
          />
          <Password
            v-else
            v-model="form.password"
            input-id="account-password"
            toggle-mask
            :feedback="false"
            autocomplete="new-password"
            :invalid="Boolean(errors.password)"
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
            :title="t('administration.password.regenerate')"
            @click="regenerate"
          />
        </div>
        <small v-if="errors.password" class="text-red-600">{{ message('password') }}</small>
        <small v-else class="text-xs text-muted-color">
          {{ t('administration.password.policy', { min: PASSWORD_MIN_LENGTH }) }}
        </small>
      </fieldset>

      <Message severity="info" :closable="false" size="small">
        {{ t('administration.accounts.firstLoginHint') }}
      </Message>

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
          :label="t('administration.accounts.createAction')"
          icon="pi pi-user-plus"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>
