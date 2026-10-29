<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminAccount } from '../../types/api'
import { useAdministrationApi } from '../../composables/useAdministrationApi'
import { useAuthStore } from '../../stores/auth'
import { useNotify } from '../../composables/useNotify'
import { isSelf } from '../../utils/accounts'

/** Accounts tab (B-13): table, creation, edition, TOTP reset and password reset. */
const { t, d } = useI18n()
const api = useAdministrationApi()
const auth = useAuthStore()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-accounts', () => api.listAccounts())
const accounts = ref<AdminAccount[]>(data.value ?? [])
watch(data, (value) => {
  if (value) accounts.value = value
})

const createVisible = ref(false)
const editVisible = ref(false)
const passwordVisible = ref(false)
const revealVisible = ref(false)
const selected = ref<AdminAccount | null>(null)
const revealed = ref<{ email: string; secret: string } | null>(null)
const busyId = ref<string | null>(null)

const roleSeverity: Record<AdminAccount['role'], string> = {
  ADMIN: 'danger',
  EDITOR: 'info',
  MONETIZATION: 'warn',
  SUPPORT: 'secondary',
}
const activeCount = computed(() => accounts.value.filter((account) => account.isActive).length)

function upsert(saved: AdminAccount): void {
  const exists = accounts.value.some((account) => account.id === saved.id)
  accounts.value = exists
    ? accounts.value.map((account) => (account.id === saved.id ? saved : account))
    : [...accounts.value, saved]
}

function openEdit(account: AdminAccount): void {
  selected.value = account
  editVisible.value = true
}

function openPasswordReset(account: AdminAccount): void {
  selected.value = account
  passwordVisible.value = true
}

function reveal(account: AdminAccount, secret: string): void {
  revealed.value = { email: account.email, secret }
  revealVisible.value = true
}

function onCreated(account: AdminAccount, password: string): void {
  upsert(account)
  reveal(account, password)
}

function askResetTotp(account: AdminAccount): void {
  confirm.require({
    header: t('administration.accounts.resetTotp'),
    message: t('administration.accounts.resetTotpConfirm', { email: account.email }),
    icon: 'pi pi-shield',
    acceptLabel: t('administration.accounts.resetTotpAction'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void resetTotp(account),
  })
}

async function resetTotp(account: AdminAccount): Promise<void> {
  busyId.value = account.id
  try {
    upsert(await api.resetTotp(account.id))
    notify.success(t('administration.toasts.totpReset', { email: account.email }))
  } catch (err) {
    notify.apiError(err, t('administration.accounts.resetTotp'))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-color">
        {{
          t(
            'administration.accounts.summary',
            { count: accounts.length, active: activeCount },
            accounts.length,
          )
        }}
      </p>
      <Button
        :label="t('administration.accounts.create')"
        icon="pi pi-user-plus"
        size="small"
        @click="createVisible = true"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('administration.accounts.loadError') }}</span>
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
      :value="accounts"
      :loading="status === 'pending' && accounts.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <Column :header="t('administration.accounts.columns.email')">
        <template #body="{ data: row }: { data: AdminAccount }">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ row.email }}</span>
            <Tag
              v-if="isSelf(auth.user, row)"
              :value="t('administration.accounts.you')"
              severity="contrast"
            />
          </div>
          <p class="text-sm text-muted-color">{{ row.displayName }}</p>
        </template>
      </Column>
      <Column :header="t('administration.accounts.columns.role')" class="w-40">
        <template #body="{ data: row }: { data: AdminAccount }">
          <Tag :value="t(`auth.roles.${row.role}`)" :severity="roleSeverity[row.role]" />
        </template>
      </Column>
      <Column :header="t('administration.accounts.columns.active')" class="w-28">
        <template #body="{ data: row }: { data: AdminAccount }">
          <Tag
            :value="
              row.isActive
                ? t('administration.accounts.active')
                : t('administration.accounts.inactive')
            "
            :severity="row.isActive ? 'success' : 'secondary'"
          />
        </template>
      </Column>
      <Column :header="t('administration.accounts.columns.totp')" class="w-32">
        <template #body="{ data: row }: { data: AdminAccount }">
          <span
            v-if="row.totpEnrolled"
            class="inline-flex items-center gap-1 text-sm text-green-700"
          >
            <i class="pi pi-shield" aria-hidden="true" />{{
              t('administration.accounts.totpEnrolled')
            }}
          </span>
          <span v-else class="inline-flex items-center gap-1 text-sm text-muted-color">
            <i class="pi pi-clock" aria-hidden="true" />{{
              t('administration.accounts.totpPending')
            }}
          </span>
        </template>
      </Column>
      <Column :header="t('administration.accounts.columns.lastLogin')" class="w-44">
        <template #body="{ data: row }: { data: AdminAccount }">
          <time v-if="row.lastLoginAt" :datetime="row.lastLoginAt">{{
            d(new Date(row.lastLoginAt), 'long')
          }}</time>
          <span v-else class="text-muted-color">{{
            t('administration.accounts.neverLoggedIn')
          }}</span>
        </template>
      </Column>
      <Column class="w-36">
        <template #body="{ data: row }: { data: AdminAccount }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('administration.accounts.edit')"
              :title="t('administration.accounts.edit')"
              @click="openEdit(row)"
            />
            <Button
              icon="pi pi-shield"
              size="small"
              text
              severity="warn"
              :loading="busyId === row.id"
              :disabled="!row.totpEnrolled"
              :aria-label="t('administration.accounts.resetTotp')"
              :title="t('administration.accounts.resetTotp')"
              @click="askResetTotp(row)"
            />
            <Button
              icon="pi pi-key"
              size="small"
              text
              severity="danger"
              :aria-label="t('administration.accounts.resetPassword')"
              :title="t('administration.accounts.resetPassword')"
              @click="openPasswordReset(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <AdministrationAccountCreateDialog v-model:visible="createVisible" @created="onCreated" />
    <AdministrationAccountEditDialog
      v-model:visible="editVisible"
      :account="selected"
      @saved="upsert"
    />
    <AdministrationPasswordResetDialog
      v-model:visible="passwordVisible"
      :account="selected"
      @reset="reveal"
    />
    <AdministrationSecretRevealDialog
      v-model:visible="revealVisible"
      :email="revealed?.email ?? null"
      :secret="revealed?.secret ?? null"
    />
  </div>
</template>
