<script setup lang="ts">
import { ref, watch } from 'vue'
import { useNotify } from '../../composables/useNotify'

/** Shows a password exactly once (after creation or reset) with a copy button. */
const props = defineProps<{
  visible: boolean
  email: string | null
  secret: string | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t } = useI18n()
const notify = useNotify()
const copied = ref(false)

watch(
  () => props.visible,
  () => {
    copied.value = false
  },
)

async function copy(): Promise<void> {
  if (!props.secret) return
  try {
    await navigator.clipboard.writeText(props.secret)
    copied.value = true
    notify.success(t('administration.reveal.copied'))
  } catch {
    notify.warn(t('administration.reveal.copyFailed'))
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('administration.reveal.title')"
    :style="{ width: 'min(30rem, 95vw)' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4">
      <p class="text-sm">{{ t('administration.reveal.hint', { email: email ?? '' }) }}</p>
      <div class="flex items-center gap-2">
        <code
          class="flex-1 select-all rounded-md border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-sm"
          data-testid="revealed-secret"
        >
          {{ secret }}
        </code>
        <Button
          :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
          :label="t('administration.reveal.copy')"
          size="small"
          outlined
          @click="copy"
        />
      </div>
      <Message severity="warn" :closable="false" size="small">{{
        t('administration.reveal.once')
      }}</Message>
      <div class="flex justify-end">
        <Button :label="t('common.close')" @click="emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>
</template>
