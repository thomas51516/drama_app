<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminAccount, AdminRole } from '../../types/api'
import { ADMIN_ROLES } from '../../types/api'
import { useAdministrationApi } from '../../composables/useAdministrationApi'
import { useAuthStore } from '../../stores/auth'
import { useNotify } from '../../composables/useNotify'
import { accountPatch, isSelf, selfLockoutReason } from '../../utils/accounts'

/** Edit name, role and activation of an account (B-13), with the self-lockout guard. */
const props = defineProps<{
  visible: boolean
  account: AdminAccount | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [account: AdminAccount]
}>()

const { t } = useI18n()
const api = useAdministrationApi()
const auth = useAuthStore()
const notify = useNotify()

const displayName = ref('')
const role = ref<AdminRole>('EDITOR')
const isActive = ref(true)
const saving = ref(false)
const roleOptions = ADMIN_ROLES.map((value) => ({ value, label: t(`auth.roles.${value}`) }))

const self = computed(() => Boolean(props.account && isSelf(auth.user, props.account)))
const patch = computed(() =>
  props.account
    ? accountPatch(props.account, {
        displayName: displayName.value,
        role: role.value,
        isActive: isActive.value,
      })
    : {},
)
const lockout = computed(() =>
  props.account ? selfLockoutReason(auth.user, props.account, patch.value) : null,
)
const dirty = computed(() => Object.keys(patch.value).length > 0)

watch(
  () => props.visible,
  (visible) => {
    if (!visible || !props.account) return
    displayName.value = props.account.displayName
    role.value = props.account.role
    isActive.value = props.account.isActive
  },
)

async function save(): Promise<void> {
  if (!props.account) return
  if (lockout.value) {
    notify.warn(t(`administration.lockout.${lockout.value}`))
    return
  }
  if (!dirty.value) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = await api.updateAccount(props.account.id, patch.value)
    notify.success(t('administration.toasts.saved'))
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('administration.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('administration.accounts.edit')"
    :style="{ width: 'min(30rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form v-if="account" class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <p class="text-sm text-muted-color">{{ account.email }}</p>
      <div class="flex flex-col gap-1">
        <label for="edit-name" class="text-sm font-medium">{{
          t('administration.accounts.columns.displayName')
        }}</label>
        <InputText id="edit-name" v-model="displayName" maxlength="80" :disabled="saving" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label for="edit-role" class="text-sm font-medium">{{
          t('administration.accounts.columns.role')
        }}</label>
        <Select
          v-model="role"
          input-id="edit-role"
          :options="roleOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          :invalid="lockout === 'selfDemote'"
          fluid
        />
        <small class="text-xs text-muted-color">{{ t(`administration.roleHints.${role}`) }}</small>
      </div>
      <div class="flex items-center gap-3">
        <ToggleSwitch
          v-model="isActive"
          input-id="edit-active"
          :disabled="saving || self"
          :invalid="lockout === 'selfDeactivate'"
        />
        <label for="edit-active" class="text-sm">{{
          t('administration.accounts.columns.active')
        }}</label>
      </div>
      <Message v-if="self" severity="info" :closable="false" size="small" data-testid="self-hint">
        {{ t('administration.lockout.selfHint') }}
      </Message>
      <Message
        v-if="lockout"
        severity="warn"
        :closable="false"
        size="small"
        data-testid="lockout-warning"
      >
        {{ t(`administration.lockout.${lockout}`) }}
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
          :label="t('common.save')"
          icon="pi pi-check"
          :loading="saving"
          :disabled="Boolean(lockout) || !dirty"
        />
      </div>
    </form>
  </Dialog>
</template>
