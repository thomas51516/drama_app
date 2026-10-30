<script setup lang="ts">
import { mockPublicCredentials } from '#base/mocks'
import { useRechargePrefs } from '#base/composables/useRechargePrefs'
import {
  DIAL_CODES,
  isCompleteOtp,
  isValidEmail,
  normalizePhone,
  PASSWORD_MIN,
  publicAuthErrorKey,
} from '#base/utils/topup'

/**
 * Sign in with the same account as the app: phone + OTP or e-mail + password (public
 * `/auth/*` routes). The Google button only appears when NUXT_PUBLIC_GOOGLE_CLIENT_ID is set.
 */
const { t } = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const session = useRechargeSession()
const prefs = useRechargePrefs()
const api = useApi()
const notify = useNotify()

type Method = 'phone' | 'email'
const method = ref<Method>(route.query.method === 'email' ? 'email' : 'phone')
const error = ref<string | null>(null)

// --- phone + OTP ----------------------------------------------------------------------
const phone = ref(DIAL_CODES[prefs.country.value] ? `${DIAL_CODES[prefs.country.value]} ` : '+')
const requestId = ref<string | null>(null)
const code = ref('')
const resendIn = ref(0)
let resendTimer: ReturnType<typeof setInterval> | null = null
const normalizedPhone = computed(() => normalizePhone(phone.value))

function startResendCountdown(seconds: number): void {
  resendIn.value = seconds
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}
onBeforeUnmount(() => {
  if (resendTimer) clearInterval(resendTimer)
})

async function requestCode(): Promise<void> {
  error.value = null
  if (!normalizedPhone.value) {
    error.value = t('recharge.authErrors.phone')
    return
  }
  try {
    const response = await session.requestOtp(normalizedPhone.value)
    requestId.value = response.requestId
    code.value = ''
    startResendCountdown(response.resendAfter)
    notify.info(t('recharge.login.codeSent', { phone: normalizedPhone.value }))
  } catch (err) {
    error.value = t(publicAuthErrorKey(err))
  }
}

async function verifyCode(): Promise<void> {
  error.value = null
  if (!requestId.value) return
  if (!isCompleteOtp(code.value)) {
    error.value = t('recharge.authErrors.otpIncomplete')
    return
  }
  try {
    await session.verifyOtp(requestId.value, code.value)
    await done()
  } catch (err) {
    error.value = t(publicAuthErrorKey(err))
    code.value = ''
  }
}

function changePhone(): void {
  requestId.value = null
  code.value = ''
  error.value = null
}

// --- e-mail + password ---------------------------------------------------------------
const email = ref('')
const password = ref('')
const emailValid = computed(() => isValidEmail(email.value))
const passwordValid = computed(() => password.value.length >= PASSWORD_MIN)

async function submitEmail(register: boolean): Promise<void> {
  error.value = null
  if (!emailValid.value) {
    error.value = t('validation.email')
    return
  }
  if (!passwordValid.value) {
    error.value = t('validation.passwordLength', { min: PASSWORD_MIN })
    return
  }
  try {
    if (register) await session.registerEmail(email.value, password.value)
    else await session.loginEmail(email.value, password.value)
    await done()
  } catch (err) {
    error.value = t(publicAuthErrorKey(err))
  }
}

// --- Google (hidden unless configured) -----------------------------------------------
const googleClientId = computed(() => String(config.public.googleClientId ?? ''))
const googleButton = ref<HTMLElement | null>(null)

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string
        callback: (response: { credential: string }) => void
      }): void
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void
    }
  }
}

onMounted(() => {
  if (!googleClientId.value || !googleButton.value) return
  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.onload = () => {
    const google = (window as unknown as { google?: GoogleIdentity }).google
    if (!google || !googleButton.value) return
    google.accounts.id.initialize({
      client_id: googleClientId.value,
      callback: async ({ credential }) => {
        error.value = null
        try {
          await session.loginGoogle(credential)
          await done()
        } catch (err) {
          error.value = t(publicAuthErrorKey(err))
        }
      },
    })
    google.accounts.id.renderButton(googleButton.value, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
    })
  }
  document.head.appendChild(script)
})

async function done(): Promise<void> {
  password.value = ''
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/packs'
  await navigateTo(redirect.startsWith('/') ? redirect : '/packs', { replace: true })
}

function useMockAccount(): void {
  method.value = 'email'
  email.value = mockPublicCredentials.email
  password.value = mockPublicCredentials.password
}

useHead({ title: t('recharge.login.pageTitle') })
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-5" data-testid="login">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('recharge.login.title') }}</h1>
      <p class="mt-1 text-sm text-muted-color">{{ t('recharge.login.subtitle') }}</p>
    </div>

    <SelectButton
      v-model="method"
      :options="[
        { value: 'phone', label: t('recharge.login.methodPhone') },
        { value: 'email', label: t('recharge.login.methodEmail') },
      ]"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :aria-label="t('recharge.login.method')"
      class="w-full"
      :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
    />

    <Message
      v-if="error"
      severity="error"
      :closable="false"
      role="alert"
      data-testid="login-error"
      >{{ error }}</Message
    >

    <!-- Phone + OTP -->
    <form
      v-if="method === 'phone' && !requestId"
      class="flex flex-col gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-4"
      novalidate
      @submit.prevent="requestCode"
    >
      <div class="flex flex-col gap-1.5">
        <label for="phone" class="text-sm font-medium">{{ t('recharge.login.phone') }}</label>
        <InputText
          id="phone"
          v-model="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="+228 90 12 34 56"
          fluid
        />
        <small class="text-xs text-muted-color">{{ t('recharge.login.phoneHint') }}</small>
      </div>
      <Button
        type="submit"
        :label="t('recharge.login.sendCode')"
        icon="pi pi-send"
        :loading="session.pending"
        :disabled="!normalizedPhone"
        fluid
        data-testid="send-code"
      />
    </form>

    <form
      v-else-if="method === 'phone'"
      class="flex flex-col gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-4"
      novalidate
      @submit.prevent="verifyCode"
    >
      <div>
        <p class="text-sm">{{ t('recharge.login.codeSentTo', { phone: normalizedPhone }) }}</p>
        <button type="button" class="text-xs text-primary underline" @click="changePhone">
          {{ t('recharge.login.changePhone') }}
        </button>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="otp" class="text-sm font-medium">{{ t('recharge.login.code') }}</label>
        <InputOtp id="otp" v-model="code" :length="6" integer-only autofocus />
        <small v-if="api.isMock" class="text-xs text-muted-color">{{
          t('recharge.login.mockOtp', { code: mockPublicCredentials.otpCode })
        }}</small>
      </div>
      <Button
        type="submit"
        :label="t('recharge.login.verify')"
        icon="pi pi-check"
        :loading="session.pending"
        :disabled="!isCompleteOtp(code)"
        fluid
        data-testid="verify-code"
      />
      <Button
        type="button"
        :label="
          resendIn > 0
            ? t('recharge.login.resendIn', { seconds: resendIn })
            : t('recharge.login.resend')
        "
        severity="secondary"
        text
        size="small"
        :disabled="resendIn > 0 || session.pending"
        @click="requestCode"
      />
    </form>

    <!-- E-mail + password -->
    <form
      v-else
      class="flex flex-col gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-4"
      novalidate
      @submit.prevent="submitEmail(false)"
    >
      <div class="flex flex-col gap-1.5">
        <label for="email" class="text-sm font-medium">{{ t('recharge.login.email') }}</label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="username"
          fluid
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-sm font-medium">{{ t('recharge.login.password') }}</label>
        <InputText
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          fluid
        />
        <small class="text-xs text-muted-color">{{
          t('recharge.login.passwordHint', { min: PASSWORD_MIN })
        }}</small>
      </div>
      <Button
        type="submit"
        :label="t('recharge.login.signIn')"
        icon="pi pi-sign-in"
        :loading="session.pending"
        :disabled="!emailValid || !passwordValid"
        fluid
        data-testid="email-sign-in"
      />
      <Button
        type="button"
        :label="t('recharge.login.register')"
        severity="secondary"
        outlined
        :disabled="!emailValid || !passwordValid || session.pending"
        fluid
        data-testid="email-register"
        @click="submitEmail(true)"
      />
    </form>

    <div v-if="googleClientId" class="flex flex-col items-center gap-2">
      <p class="text-xs text-muted-color">{{ t('recharge.login.or') }}</p>
      <div ref="googleButton" data-testid="google-button" />
    </div>

    <p v-if="api.isMock" class="text-xs text-muted-color">
      {{ t('recharge.login.mockHint') }}
      <button
        type="button"
        class="underline"
        data-testid="use-mock-account"
        @click="useMockAccount"
      >
        {{ mockPublicCredentials.email }}
      </button>
    </p>
  </div>
</template>
