<script setup lang="ts">
import type { AdminSeriesInput } from '#base/types/api'
import { canEditCatalogue } from '#base/utils/series-form'

const { t } = useI18n()
const api = useCatalogueApi()
const notify = useNotify()
const auth = useAuthStore()

const saving = ref(false)

// Only EDITOR and ADMIN may create a series; others land on the read-only list.
if (!canEditCatalogue(auth.user?.role)) {
  notify.warn(t('errors.forbidden'))
  await navigateTo('/series', { replace: true })
}

async function onSubmit(input: Partial<AdminSeriesInput>): Promise<void> {
  saving.value = true
  try {
    const created = await api.createSeries(input)
    notify.success(t('series.toasts.created', { title: created.title }))
    await navigateTo(`/series/${created.id}/episodes`)
  } catch (error) {
    notify.apiError(error, t('series.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <LayoutPageHeader
      :title="t('series.create')"
      :subtitle="t('series.form.newSubtitle')"
      :crumbs="[{ label: t('series.create') }]"
    />
    <CatalogueSeriesForm :saving="saving" @submit="onSubmit">
      <template #actions>
        <NuxtLink to="/series">
          <Button type="button" :label="t('common.cancel')" severity="secondary" text />
        </NuxtLink>
      </template>
    </CatalogueSeriesForm>
  </div>
</template>
