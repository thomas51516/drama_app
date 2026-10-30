<script setup lang="ts">
/** Placeholder of the privacy policy (§14): the final text comes from the client's counsel. */
const { t } = useI18n()
useHead({ title: t('recharge.legal.privacyTitle') })
</script>

<template>
  <article class="prose-sm mx-auto max-w-prose" data-testid="legal-privacy">
    <h1 class="text-2xl font-semibold">{{ t('recharge.legal.privacyTitle') }}</h1>
    <Message severity="warn" :closable="false" class="my-4">{{
      t('recharge.legal.placeholder')
    }}</Message>
    <section
      v-for="(section, index) in ['data', 'purpose', 'retention', 'rights', 'cookies']"
      :key="section"
      class="mt-5"
    >
      <h2 class="text-lg font-semibold">
        {{ index + 1 }}. {{ t(`recharge.legal.privacy.${section}.title`) }}
      </h2>
      <p class="mt-1 text-sm text-muted-color">{{ t(`recharge.legal.privacy.${section}.text`) }}</p>
    </section>
  </article>
</template>
