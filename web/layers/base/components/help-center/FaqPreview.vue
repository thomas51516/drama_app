<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FaqEntry, FaqLanguage } from '../../types/api'
import { FAQ_LANGUAGES } from '../../types/api'
import { faqPreview, localizedText } from '../../utils/help-center'

/**
 * What the app shows for the selected language: computed locally from the admin entries with
 * `faqPreview()` (same rules as the public `GET /help/faq`: published only, French fallback).
 */
const props = defineProps<{ entries: FaqEntry[] }>()
const { t } = useI18n()

const lang = ref<FaqLanguage>('fr')
const preview = computed(() => faqPreview(props.entries, lang.value))
const openIds = ref<string[]>([])

/** Entries whose text falls back to French in the selected language (badge in the preview). */
const fallbackIds = computed(() => {
  if (lang.value === 'fr') return new Set<string>()
  return new Set(
    props.entries
      .filter((entry) => entry.isPublished)
      .filter(
        (entry) =>
          localizedText(entry.question, lang.value) === localizedText(entry.question, 'fr') &&
          !(entry.question[lang.value] ?? '').trim(),
      )
      .map((entry) => entry.id),
  )
})
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="faq-preview">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="font-semibold">{{ t('helpCenter.faq.preview.title') }}</h3>
        <p class="text-xs text-muted-color">{{ t('helpCenter.faq.preview.hint') }}</p>
      </div>
      <SelectButton
        v-model="lang"
        :options="[...FAQ_LANGUAGES]"
        :allow-empty="false"
        size="small"
        :aria-label="t('helpCenter.faq.preview.language')"
      >
        <template #option="{ option }">
          <span class="uppercase">{{ option }}</span>
        </template>
      </SelectButton>
    </div>

    <div
      class="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-surface-800 bg-surface-0 p-4 shadow-lg"
    >
      <p class="mb-3 text-center text-sm font-semibold">{{ t('nav.helpCenter') }}</p>
      <p v-if="preview.categories.length === 0" class="py-8 text-center text-sm text-muted-color">
        {{ t('helpCenter.faq.preview.empty') }}
      </p>
      <div v-else class="flex max-h-[32rem] flex-col gap-4 overflow-y-auto pr-1">
        <div v-for="category in preview.categories" :key="category.key">
          <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-color">
            {{ category.title }}
          </h4>
          <Accordion v-model:value="openIds" multiple>
            <AccordionPanel v-for="entry in category.entries" :key="entry.id" :value="entry.id">
              <AccordionHeader>
                <span class="flex items-center gap-2 text-left text-sm">
                  {{ entry.question }}
                  <Tag
                    v-if="fallbackIds.has(entry.id)"
                    :value="t('helpCenter.faq.preview.fallback')"
                    severity="secondary"
                    class="text-[10px]"
                  />
                </span>
              </AccordionHeader>
              <AccordionContent>
                <p class="whitespace-pre-line text-sm text-surface-700">{{ entry.answer }}</p>
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </div>
      </div>
    </div>
  </section>
</template>
