<script setup lang="ts">
import { ApiError } from '#base/utils/api-error'
import { mockAccounts, mockCredentials } from '#base/mocks'

definePageMeta({ layout: 'auth', public: true })

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const api = useApi()

const email = ref('')
const password = ref('')
const code = ref('')
const rememberDevice = ref(false)
const error = ref<string | null>(null)
const notify = useNotify()

const codeIsValid = computed(() => /^\d{6}$/.test(code.value))

onMounted(() => {
  // A refresh in the middle of the flow restarts from the credentials.
  auth.resetChallenge()
})

function describeError(err: unknown, fallbackKey: string): string {
  if (ApiError.is(err)) {
    if (err.status === 401) return t(fallbackKey)
    if (err.status === 0) return t('auth.errors.network')
    return t('auth.errors.generic', { status: err.status })
  }
  return t('auth.errors.generic', { status: '?' })
}

async function goToApp(): Promise<void> {
  password.value = ''
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await navigateTo(redirect.startsWith('/') ? redirect : '/', { replace: true })
}

async function submitCredentials(): Promise<void> {
  error.value = null
  try {
    const step = await auth.login(email.value.trim(), password.value)
    code.value = ''
    rememberDevice.value = false
    if (step === 'done') {
      // Trusted device (B-13+): the server accepted the device token, no code needed.
      notify.info(t('auth.trustedDeviceWelcome'))
      await goToApp()
    }
  } catch (err) {
    error.value = describeError(err, 'auth.errors.invalidCredentials')
  }
}

async function submitCode(): Promise<void> {
  if (!codeIsValid.value) return
  error.value = null
  try {
    await auth.verifyTotp(code.value, rememberDevice.value)
    await goToApp()
  } catch (err) {
    error.value = describeError(err, 'auth.errors.invalidTotp')
    code.value = ''
  }
}

function backToCredentials(): void {
  error.value = null
  code.value = ''
  auth.resetChallenge()
}
</script>

<template>
  <Card class="w-full max-w-md">
    <template #title>
      <div class="flex items-center gap-3">
        <span
          class="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-contrast"
          aria-hidden="true"
        >
          D
        </span>
        <div class="leading-tight">
          <div class="text-lg font-semibold">{{ t('app.name') }}</div>
          <div class="text-sm font-normal text-muted-color">{{ t('app.backoffice') }}</div>
        </div>
      </div>
    </template>

    <template #content>
      <Message v-if="error" severity="error" :closable="false" class="mb-4" role="alert">
        {{ error }}
      </Message>

      <!-- Step 1: credentials -->
      <form
        v-if="auth.step === 'credentials'"
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="submitCredentials"
      >
        <div>
          <h1 class="text-xl font-semibold">{{ t('auth.title') }}</h1>
          <p class="mt-1 text-sm text-muted-color">{{ t('auth.subtitle') }}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="email" class="text-sm font-medium">{{ t('auth.email') }}</label>
          <InputText
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            autofocus
            fluid
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="password" class="text-sm font-medium">{{ t('auth.password') }}</label>
          <Password
            v-model="password"
            input-id="password"
            :feedback="false"
            toggle-mask
            autocomplete="current-password"
            required
            fluid
          />
        </div>

        <Button
          type="submit"
          :label="t('auth.signIn')"
          :loading="auth.pending"
          :disabled="!email || !password"
          fluid
        />

        <div v-if="api.isMock" class="text-xs text-muted-color">
          <p>{{ t('common.mockBanner') }}</p>
          <p class="mt-1">
            {{ t('auth.mockAccounts') }}
            <code>{{ mockCredentials.password }}</code> / TOTP
            <code>{{ mockCredentials.totpCode }}</code>
          </p>
          <ul class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <li v-for="account in mockAccounts" :key="account.email">
              <button type="button" class="underline" @click="email = account.email">
                {{ account.email }}
              </button>
              <span> ({{ t(`auth.roles.${account.role}`) }})</span>
            </li>
          </ul>
        </div>
      </form>

      <!-- Step 2: TOTP code (verification or first enrolment) -->
      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="submitCode">
        <div>
          <h1 class="text-xl font-semibold">
            {{ auth.step === 'totp_setup' ? t('auth.totpSetupTitle') : t('auth.totpTitle') }}
          </h1>
          <p class="mt-1 text-sm text-muted-color">
            {{ auth.step === 'totp_setup' ? t('auth.totpSetupHint') : t('auth.totpHint') }}
          </p>
        </div>

        <div
          v-if="auth.step === 'totp_setup' && auth.totpSetup"
          class="rounded-md bg-surface-100 p-3 text-sm"
        >
          <div class="text-xs font-medium uppercase text-muted-color">
            {{ t('auth.totpSecret') }}
          </div>
          <code class="mt-1 block break-all text-base tracking-wider">{{
            auth.totpSetup.secret
          }}</code>
          <a
            :href="auth.totpSetup.otpauthUri"
            class="mt-2 inline-block text-xs text-primary underline"
          >
            otpauth://
          </a>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="totp" class="text-sm font-medium">{{ t('auth.totpCode') }}</label>
          <InputOtp id="totp" v-model="code" :length="6" integer-only autofocus />
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <Checkbox v-model="rememberDevice" input-id="remember-device" binary />
            <label for="remember-device" class="text-sm">{{ t('auth.rememberDevice') }}</label>
          </div>
          <small class="pl-7 text-xs text-muted-color">{{ t('auth.rememberDeviceHint') }}</small>
        </div>

        <Button
          type="submit"
          :label="t('auth.verify')"
          :loading="auth.pending"
          :disabled="!codeIsValid"
          fluid
        />
        <Button
          type="button"
          :label="t('auth.back')"
          severity="secondary"
          text
          size="small"
          @click="backToCredentials"
        />
      </form>
    </template>
  </Card>
</template>
