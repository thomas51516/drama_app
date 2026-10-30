<script setup lang="ts">
import { computed } from 'vue'
import { offerState, type OfferState } from '../../utils/offers'

/** Lifecycle tag of an offer or promo code: live / scheduled / ended / inactive (+ exhausted). */
const props = defineProps<{
  item: { isActive: boolean; startsAt?: string | null; endsAt?: string | null }
  exhausted?: boolean
}>()
const { t } = useI18n()

const state = computed<OfferState | 'exhausted'>(() =>
  props.exhausted ? 'exhausted' : offerState(props.item),
)
const severity = computed(() => {
  switch (state.value) {
    case 'live':
      return 'success'
    case 'scheduled':
      return 'info'
    case 'exhausted':
      return 'warn'
    case 'ended':
      return 'secondary'
    default:
      return 'contrast'
  }
})
</script>

<template>
  <Tag :value="t(`offers.state.${state}`)" :severity="severity" :data-state="state" />
</template>
