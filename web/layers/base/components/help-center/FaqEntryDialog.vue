<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FaqEntry, FaqLanguage } from '../../types/api'
import { FAQ_LANGUAGES } from '../../types/api'
import { useHelpCenterApi } from '../../composables/useHelpCenterApi'
import { useNotify } from '../../composables/useNotify'
import {
  FAQ_ANSWER_MAX,
  FAQ_CATEGORIES,
  FAQ_QUESTION_MAX,
  emptyFaqForm,
  faqEntryToForm,
  faqFormToInput,
  validateFaqForm,
  type FaqFormErrors,
} from '../../utils/help-center'

/** Create / edit dialog of a FAQ entry: category, 4-language question/answer (fr required). */
const props = defineProps<{
  visible: boolean
  entry: FaqEntry | null
  /** Pre-selected category for a new entry. */
  category?: string
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [entry: FaqEntry]
}>()

const { t } = useI18n()
const api = useHelpCenterApi()
const notify = useNotify()

const form = ref(emptyFaqForm())
const errors = ref<FaqFormErrors>({})
const submitted = ref(false)
const saving = ref(false)
const lang = ref<FaqLanguage>('fr')

const isEdit = computed(() => props.entry !== null)
const title = computed(() => (isEdit.value ? t('helpCenter.faq.edit') : t('helpCenter.faq.create')))
const categoryOptions = FAQ_CATEGORIES.map((value) => ({
  value,
  label: t(`helpCenter.faq.categories.${value}`),
}))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.entry ? faqEntryToForm(props.entry) : emptyFaqForm(props.category)
    lang.value = 'fr'
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateFaqForm(values)
  },
  { deep: true },
)

function hasText(code: FaqLanguage): boolean {
  return Boolean(form.value.question[code].trim() || form.value.answer[code].trim())
}

function errorMessage(key: keyof FaqFormErrors): string | undefined {
  const code = errors.value[key]
  if (!code) return undefined
  return t(code, { max: key === 'question' ? FAQ_QUESTION_MAX : FAQ_ANSWER_MAX })
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateFaqForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    if (errors.value.question === 'validation.requiredFrench' || errors.value.answer) {
      lang.value = 'fr'
    }
    return
  }
  saving.value = true
  try {
    const input = faqFormToInput(form.value)
    const saved = props.entry
      ? await api.updateFaq(props.entry.id, input)
      : await api.createFaq(input)
    notify.success(
      t(isEdit.value ? 'helpCenter.faq.toasts.saved' : 'helpCenter.faq.toasts.created'),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('helpCenter.faq.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(44rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="faq-category" class="text-sm font-medium">{{
          t('helpCenter.faq.form.category')
        }}</label>
        <Select
          v-model="form.category"
          input-id="faq-category"
          :options="categoryOptions"
          option-label="label"
          option-value="value"
          :invalid="Boolean(errors.category)"
          :disabled="saving"
          fluid
        />
        <small v-if="errors.category" class="text-red-600">{{ errorMessage('category') }}</small>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium">{{ t('helpCenter.faq.form.languageTabs') }}</span>
          <SelectButton
            v-model="lang"
            :options="[...FAQ_LANGUAGES]"
            :allow-empty="false"
            :disabled="saving"
            size="small"
            :aria-label="t('helpCenter.faq.form.languageTabs')"
          >
            <template #option="{ option }">
              <span class="flex items-center gap-1 uppercase">
                {{ option }}
                <i
                  v-if="hasText(option)"
                  class="pi pi-check text-[10px]"
                  :aria-label="t('common.yes')"
                />
              </span>
            </template>
          </SelectButton>
        </div>
        <small class="text-xs text-muted-color">{{
          t('helpCenter.faq.form.frenchRequired')
        }}</small>

        <div class="flex flex-col gap-1">
          <label :for="`faq-question-${lang}`" class="text-sm font-medium">
            {{ t('helpCenter.faq.form.question') }} ({{ lang.toUpperCase() }})
            <span v-if="lang === 'fr'" aria-hidden="true">*</span>
          </label>
          <InputText
            :id="`faq-question-${lang}`"
            v-model="form.question[lang]"
            :maxlength="FAQ_QUESTION_MAX"
            :invalid="Boolean(errors.question) && lang === 'fr'"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.question" class="text-red-600">{{ errorMessage('question') }}</small>
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`faq-answer-${lang}`" class="text-sm font-medium">
            {{ t('helpCenter.faq.form.answer') }} ({{ lang.toUpperCase() }})
            <span v-if="lang === 'fr'" aria-hidden="true">*</span>
          </label>
          <Textarea
            :id="`faq-answer-${lang}`"
            v-model="form.answer[lang]"
            rows="5"
            auto-resize
            :maxlength="FAQ_ANSWER_MAX"
            :invalid="Boolean(errors.answer) && lang === 'fr'"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.answer" class="text-red-600">{{ errorMessage('answer') }}</small>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isPublished" input-id="faq-published" :disabled="saving" />
        <label for="faq-published" class="text-sm">{{ t('helpCenter.faq.form.published') }}</label>
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
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>
