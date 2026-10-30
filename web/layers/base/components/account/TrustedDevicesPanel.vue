<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TrustedDevice } from '../../types/api'
import { useAccountApi } from '../../composables/useAccountApi'
import { useNotify } from '../../composables/useNotify'
import { useAuthStore } from '../../stores/auth'

/**
 * « Mon compte » → trusted devices (B-13+): list with per-device revoke and a
 * « Révoquer cet appareil » that revokes the current device server-side (when the API flags
 * it) and always drops the local `drama_admin_device` cookie.
 */
const { t, d } = useI18n()
const api = useAccountApi()
const auth = useAuthStore()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('account-devices', () => api.listDevices())
const devices = ref<TrustedDevice[]>(data.value ?? [])
watch(data, (value) => {
  if (value) devices.value = value
})

const busyId = ref<string | null>(null)
const forgetting = ref(false)

const currentDevice = computed(() => devices.value.find((device) => device.current) ?? null)

function labelOf(device: TrustedDevice): string {
  return device.label?.trim() || t('account.devices.unknownLabel')
}

function formatDate(iso: string | null): string {
  return iso ? d(new Date(iso), 'long') : t('common.never')
}

function askRevoke(device: TrustedDevice): void {
  confirm.require({
    header: t('account.devices.revoke'),
    message: t('account.devices.revokeConfirm', { label: labelOf(device) }),
    icon: 'pi pi-shield',
    acceptLabel: t('account.devices.revoke'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void revoke(device),
  })
}

async function revoke(device: TrustedDevice): Promise<void> {
  busyId.value = device.id
  try {
    await api.revokeDevice(device.id)
    devices.value = devices.value.filter((item) => item.id !== device.id)
    // Revoking the device this browser uses also drops its cookie.
    if (device.current) auth.forgetDevice()
    notify.success(t('account.devices.revoked'))
  } catch (err) {
    notify.apiError(err, t('account.devices.revoke'))
  } finally {
    busyId.value = null
  }
}

function askForgetThis(): void {
  confirm.require({
    header: t('account.devices.revokeThis'),
    message: t('account.devices.revokeThisConfirm'),
    icon: 'pi pi-shield',
    acceptLabel: t('account.devices.revokeThis'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void forgetThis(),
  })
}

async function forgetThis(): Promise<void> {
  forgetting.value = true
  try {
    const current = currentDevice.value
    if (current) {
      await api.revokeDevice(current.id)
      devices.value = devices.value.filter((item) => item.id !== current.id)
    }
    auth.forgetDevice()
    notify.success(t('account.devices.forgotten'))
  } catch (err) {
    notify.apiError(err, t('account.devices.revokeThis'))
  } finally {
    forgetting.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="trusted-devices">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('account.devices.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">{{ t('account.devices.hint') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          :label="t('common.refresh')"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          size="small"
          :loading="status === 'pending'"
          @click="refresh()"
        />
        <Button
          v-if="auth.hasTrustedDevice"
          :label="t('account.devices.revokeThis')"
          icon="pi pi-shield"
          severity="danger"
          outlined
          size="small"
          :loading="forgetting"
          data-testid="revoke-this-device"
          @click="askForgetThis"
        />
      </div>
    </div>

    <Message v-if="auth.hasTrustedDevice" severity="info" :closable="false">
      {{
        currentDevice ? t('account.devices.thisBrowser') : t('account.devices.thisBrowserUnknown')
      }}
    </Message>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('account.devices.loadError') }}</span>
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
      :value="devices"
      :loading="status === 'pending' && devices.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #empty>
        <div class="py-10 text-center">
          <i class="pi pi-mobile text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 text-sm text-muted-color">{{ t('account.devices.empty') }}</p>
        </div>
      </template>
      <Column :header="t('account.devices.columns.label')">
        <template #body="{ data: device }: { data: TrustedDevice }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ labelOf(device) }}</span>
            <Tag
              v-if="device.current"
              :value="t('account.devices.current')"
              severity="success"
              icon="pi pi-check"
            />
          </div>
        </template>
      </Column>
      <Column :header="t('account.devices.columns.createdAt')" class="w-44">
        <template #body="{ data: device }: { data: TrustedDevice }">
          <span class="text-sm tabular-nums">{{ formatDate(device.createdAt) }}</span>
        </template>
      </Column>
      <Column :header="t('account.devices.columns.lastUsedAt')" class="w-44">
        <template #body="{ data: device }: { data: TrustedDevice }">
          <span class="text-sm tabular-nums">{{ formatDate(device.lastUsedAt) }}</span>
        </template>
      </Column>
      <Column :header="t('account.devices.columns.expiresAt')" class="w-44">
        <template #body="{ data: device }: { data: TrustedDevice }">
          <span class="text-sm tabular-nums">{{ formatDate(device.expiresAt) }}</span>
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: device }: { data: TrustedDevice }">
          <div class="flex justify-end">
            <Button
              :label="t('account.devices.revoke')"
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              :loading="busyId === device.id"
              @click="askRevoke(device)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </section>
</template>
