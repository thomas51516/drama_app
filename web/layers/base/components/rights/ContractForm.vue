<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { RightsContract } from '../../types/api'
import { useRightsApi } from '../../composables/useRightsApi'
import { useNotify } from '../../composables/useNotify'
import { fromPickerDate, toPickerDate } from '../../utils/schedule'
import {
  canManageRights,
  emptyRightsContractForm,
  rightsContractToForm,
  rightsContractToInput,
  RIGHTS_HOLDER_MAX,
  RIGHTS_NOTES_MAX,
  validateRightsContractForm,
  type RightsContractErrors,
} from '../../utils/rights'

/**
 * Droits et contrats (B-12, sprint 9): create / edit / delete the series' one current contract,
 * inline on the series page. Dates are entered in Lomé wall time and sent as UTC, same convention
 * as the rest of the back-office (`toPickerDate` / `fromPickerDate`).
 */
const props = defineProps<{ seriesId: string; contract: RightsContract | null }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const api = useRightsApi()
const notify = useNotify()
const confirm = useConfirm()
const auth = useAuthStore()

const canManage = computed(() => canManageRights(auth.user?.role))
const isEdit = computed(() => props.contract !== null)

const values = reactive(
  props.contract ? rightsContractToForm(props.contract) : emptyRightsContractForm(),
)
const startsAtPicker = ref<Date | null>(toPickerDate(values.licenseStartsAt))
const endsAtPicker = ref<Date | null>(toPickerDate(values.licenseEndsAt))
const errors = ref<RightsContractErrors>({})
const submitted = ref(false)
const saving = ref(false)
const deleting = ref(false)

watch(
  () => props.contract,
  (contract) => {
    Object.assign(values, contract ? rightsContractToForm(contract) : emptyRightsContractForm())
    startsAtPicker.value = toPickerDate(values.licenseStartsAt)
    endsAtPicker.value = toPickerDate(values.licenseEndsAt)
    errors.value = {}
    submitted.value = false
  },
)
watch(startsAtPicker, (value) => {
  values.licenseStartsAt = fromPickerDate(value)
})
watch(endsAtPicker, (value) => {
  values.licenseEndsAt = fromPickerDate(value)
})

function errorMessage(field: keyof RightsContractErrors): string | null {
  const code = errors.value[field]
  return code ? t(code) : null
}

async function onSubmit(): Promise<void> {
  submitted.value = true
  errors.value = validateRightsContractForm(values)
  if (Object.keys(errors.value).length > 0) return
  saving.value = true
  try {
    if (props.contract) {
      const patch = rightsContractToInput(values, props.contract)
      if (Object.keys(patch).length === 0) {
        notify.info(t('rights.form.nothingToSave'))
        return
      }
      await api.updateContract(props.seriesId, patch)
      notify.success(t('rights.form.saved'))
    } else {
      await api.createContract(props.seriesId, rightsContractToInput(values))
      notify.success(t('rights.form.created'))
    }
    emit('changed')
  } catch (err) {
    notify.apiError(err, t('rights.form.saveFailed'))
  } finally {
    saving.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: t('rights.form.delete'),
    message: t('rights.form.deleteConfirm'),
    icon: 'pi pi-trash',
    acceptLabel: t('rights.form.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void onDelete(),
  })
}

async function onDelete(): Promise<void> {
  deleting.value = true
  try {
    await api.deleteContract(props.seriesId)
    notify.success(t('rights.form.deleted'))
    emit('changed')
  } catch (err) {
    notify.apiError(err, t('rights.form.deleteFailed'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <fieldset class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5">
    <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
      {{ t('rights.form.legend') }}
    </legend>

    <p v-if="!canManage" class="text-sm text-muted-color">{{ t('rights.form.readOnly') }}</p>

    <div class="flex flex-col gap-1.5">
      <label for="rights-holder" class="text-sm font-medium">
        {{ t('rights.form.rightsHolder') }} <span aria-hidden="true">*</span>
      </label>
      <InputText
        id="rights-holder"
        v-model="values.rightsHolder"
        :maxlength="RIGHTS_HOLDER_MAX"
        :invalid="Boolean(errorMessage('rightsHolder'))"
        :disabled="!canManage || saving"
        autocomplete="off"
        fluid
      />
      <small v-if="errorMessage('rightsHolder')" class="text-red-600">
        {{ errorMessage('rightsHolder') }}
      </small>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="rights-territories" class="text-sm font-medium">
        {{ t('series.form.territories') }}
      </label>
      <CatalogueTerritoriesInput
        v-model="values.territories"
        input-id="rights-territories"
        :disabled="!canManage || saving"
      />
      <small class="text-xs text-muted-color">{{ t('series.form.territoriesHint') }}</small>
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label for="rights-starts" class="text-sm font-medium">
          {{ t('rights.form.licenseStartsAt') }} <span aria-hidden="true">*</span>
        </label>
        <DatePicker
          id="rights-starts"
          v-model="startsAtPicker"
          show-icon
          show-button-bar
          date-format="dd/mm/yy"
          :invalid="Boolean(errorMessage('licenseStartsAt'))"
          :disabled="!canManage || saving"
          fluid
        />
        <small v-if="errorMessage('licenseStartsAt')" class="text-red-600">
          {{ errorMessage('licenseStartsAt') }}
        </small>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="rights-ends" class="text-sm font-medium">
          {{ t('rights.form.licenseEndsAt') }}
        </label>
        <DatePicker
          id="rights-ends"
          v-model="endsAtPicker"
          show-icon
          show-button-bar
          date-format="dd/mm/yy"
          :invalid="Boolean(errorMessage('licenseEndsAt'))"
          :disabled="!canManage || saving"
          fluid
        />
        <small v-if="errorMessage('licenseEndsAt')" class="text-red-600">
          {{ errorMessage('licenseEndsAt') }}
        </small>
        <small v-else class="text-xs text-muted-color">{{
          t('rights.form.licenseEndsAtHint')
        }}</small>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="rights-notes" class="text-sm font-medium">{{ t('rights.form.notes') }}</label>
      <Textarea
        id="rights-notes"
        v-model="values.notes"
        rows="3"
        auto-resize
        :maxlength="RIGHTS_NOTES_MAX"
        :disabled="!canManage || saving"
        fluid
      />
    </div>

    <div v-if="canManage" class="flex flex-wrap items-center justify-between gap-3">
      <Button
        v-if="isEdit"
        :label="t('rights.form.delete')"
        icon="pi pi-trash"
        severity="danger"
        outlined
        :loading="deleting"
        :disabled="saving"
        @click="askDelete"
      />
      <span v-else />
      <Button
        :label="isEdit ? t('rights.form.save') : t('rights.form.create')"
        icon="pi pi-check"
        :loading="saving"
        :disabled="deleting"
        @click="onSubmit"
      />
    </div>
  </fieldset>
</template>
