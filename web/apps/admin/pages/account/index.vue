<script setup lang="ts">
/** « Mon compte » (B-13+): profile summary and trusted devices of the signed-in user. */
const { t } = useI18n()
const auth = useAuthStore()
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('account.title')"
      :subtitle="t('account.subtitle')"
      :crumbs="[{ label: t('account.title') }]"
    />

    <div class="flex flex-col gap-8">
      <section
        v-if="auth.user"
        class="rounded-lg border border-surface-200 bg-surface-0 p-5"
        data-testid="account-profile"
      >
        <h2 class="text-lg font-semibold">{{ t('account.profile') }}</h2>
        <dl class="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs uppercase text-muted-color">{{ t('account.displayName') }}</dt>
            <dd class="font-medium">{{ auth.user.displayName }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-muted-color">{{ t('account.email') }}</dt>
            <dd class="font-medium">{{ auth.user.email }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase text-muted-color">{{ t('account.role') }}</dt>
            <dd class="font-medium">{{ t(`auth.roles.${auth.user.role}`) }}</dd>
          </div>
        </dl>
      </section>

      <AccountTrustedDevicesPanel />
    </div>
  </div>
</template>
