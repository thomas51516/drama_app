<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SupportTicket, SupportTicketStatus } from '../../types/api'
import { SUPPORT_TICKET_STATUSES } from '../../types/api'
import { useHelpCenterApi } from '../../composables/useHelpCenterApi'
import { useNotify } from '../../composables/useNotify'
import { useSupportInboxStore } from '../../stores/support-inbox'
import {
  TICKET_REPLY_MAX,
  canCloseTicket,
  canReplyTicket,
  isTicketStatus,
  lastMessage,
  ticketStatusSeverity,
  validateTicketReply,
} from '../../utils/help-center'

/** Support tab (B-03bis): ticket inbox with status filter, conversation, reply and close. */
const { t, d } = useI18n()
const api = useHelpCenterApi()
const notify = useNotify()
const confirm = useConfirm()
const inbox = useSupportInboxStore()
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 20
const page = ref(1)
const statusFilter = ref<SupportTicketStatus | null>(
  isTicketStatus(route.query.ticketStatus) ? route.query.ticketStatus : 'OPEN',
)
watch(statusFilter, (value) => {
  page.value = 1
  void router.replace({ query: { ...route.query, ticketStatus: value ?? 'all' } })
})

const { data, status, error, refresh } = useAsyncData(
  'admin-support-tickets',
  () =>
    api.listTickets({
      status: statusFilter.value ?? undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    }),
  { watch: [statusFilter, page] },
)
const tickets = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)

const statusOptions = [
  { value: null, label: t('helpCenter.support.filters.all') },
  ...SUPPORT_TICKET_STATUSES.map((value) => ({
    value,
    label: t(`helpCenter.support.status.${value}`),
  })),
]

const selected = ref<SupportTicket | null>(null)
const reply = ref('')
const replyError = ref<string | null>(null)
const sending = ref(false)
const closing = ref(false)

async function select(ticket: SupportTicket): Promise<void> {
  selected.value = ticket
  reply.value = ''
  replyError.value = null
  try {
    selected.value = await api.getTicket(ticket.id)
  } catch (err) {
    notify.apiError(err, t('helpCenter.support.loadError'))
  }
}

function patchList(updated: SupportTicket): void {
  if (!data.value) return
  data.value = {
    ...data.value,
    items: data.value.items.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
  }
}

async function syncBadge(): Promise<void> {
  await inbox.refresh()
}

async function sendReply(): Promise<void> {
  if (!selected.value) return
  replyError.value = validateTicketReply(reply.value)
  if (replyError.value) return
  sending.value = true
  try {
    const updated = await api.replyTicket(selected.value.id, reply.value.trim())
    selected.value = updated
    patchList(updated)
    reply.value = ''
    notify.success(t('helpCenter.support.toasts.replied'))
    await Promise.all([refresh(), syncBadge()])
  } catch (err) {
    notify.apiError(err, t('helpCenter.support.toasts.failed'))
  } finally {
    sending.value = false
  }
}

function askClose(): void {
  const ticket = selected.value
  if (!ticket) return
  confirm.require({
    header: t('helpCenter.support.close'),
    message: t('helpCenter.support.closeConfirm', { subject: ticket.subject }),
    icon: 'pi pi-lock',
    acceptLabel: t('helpCenter.support.close'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void closeTicket(ticket),
  })
}

async function closeTicket(ticket: SupportTicket): Promise<void> {
  closing.value = true
  try {
    const updated = await api.closeTicket(ticket.id)
    if (selected.value?.id === updated.id) selected.value = updated
    patchList(updated)
    notify.success(t('helpCenter.support.toasts.closed'))
    await Promise.all([refresh(), syncBadge()])
  } catch (err) {
    notify.apiError(err, t('helpCenter.support.toasts.failed'))
  } finally {
    closing.value = false
  }
}

function formatDate(iso: string): string {
  return d(new Date(iso), 'long')
}

function categoryLabel(category: string): string {
  const key = `helpCenter.faq.categories.${category}`
  const label = t(key)
  return label === key ? category : label
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]" data-testid="support-inbox">
    <!-- Ticket list -->
    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-muted-color">
          {{ t('helpCenter.support.summary', { count: total }, total) }}
        </p>
        <Select
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          class="w-44"
          :aria-label="t('helpCenter.support.filters.status')"
        />
      </div>

      <Message v-if="error" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('helpCenter.support.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refresh()"
          />
        </div>
      </Message>

      <ul
        class="flex flex-col divide-y divide-surface-200 rounded-lg border border-surface-200 bg-surface-0"
        :aria-busy="status === 'pending'"
      >
        <li
          v-if="status !== 'pending' && tickets.length === 0"
          class="p-6 text-center text-sm text-muted-color"
        >
          {{ t('helpCenter.support.empty') }}
        </li>
        <li v-for="ticket in tickets" :key="ticket.id">
          <button
            type="button"
            class="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-50"
            :class="selected?.id === ticket.id ? 'bg-primary-50' : ''"
            :aria-current="selected?.id === ticket.id ? 'true' : undefined"
            @click="select(ticket)"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="truncate font-medium">{{ ticket.subject }}</span>
              <Tag
                :value="t(`helpCenter.support.status.${ticket.status}`)"
                :severity="ticketStatusSeverity(ticket.status)"
                class="shrink-0"
              />
            </span>
            <span class="truncate text-xs text-muted-color">{{ ticket.userLabel }}</span>
            <span v-if="lastMessage(ticket)" class="line-clamp-1 text-xs text-surface-600">
              {{ lastMessage(ticket)?.body }}
            </span>
            <span class="text-[11px] tabular-nums text-muted-color">{{
              formatDate(ticket.updatedAt)
            }}</span>
          </button>
        </li>
      </ul>

      <Paginator
        v-if="total > PAGE_SIZE"
        :rows="PAGE_SIZE"
        :total-records="total"
        :first="(page - 1) * PAGE_SIZE"
        @page="page = $event.page + 1"
      />
    </section>

    <!-- Conversation -->
    <section
      class="flex min-h-[24rem] flex-col rounded-lg border border-surface-200 bg-surface-0"
      data-testid="ticket-conversation"
    >
      <p v-if="!selected" class="m-auto p-8 text-center text-sm text-muted-color">
        {{ t('helpCenter.support.selectHint') }}
      </p>
      <template v-else>
        <header
          class="flex flex-wrap items-start justify-between gap-3 border-b border-surface-200 px-5 py-4"
        >
          <div class="min-w-0">
            <h3 class="truncate text-lg font-semibold">{{ selected.subject }}</h3>
            <p class="text-sm text-muted-color">
              {{ selected.userLabel }} · {{ categoryLabel(selected.category) }} ·
              {{ t('helpCenter.support.createdAt') }} {{ formatDate(selected.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Tag
              :value="t(`helpCenter.support.status.${selected.status}`)"
              :severity="ticketStatusSeverity(selected.status)"
            />
            <Button
              v-if="canCloseTicket(selected.status)"
              :label="t('helpCenter.support.close')"
              icon="pi pi-lock"
              severity="secondary"
              outlined
              size="small"
              :loading="closing"
              @click="askClose"
            />
          </div>
        </header>

        <ol class="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <li
            v-for="(message, index) in selected.messages"
            :key="index"
            class="flex"
            :class="message.from === 'support' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[80%] rounded-lg px-3 py-2 text-sm"
              :class="
                message.from === 'support'
                  ? 'bg-primary text-primary-contrast'
                  : 'bg-surface-100 text-surface-900'
              "
            >
              <p class="mb-1 text-[11px] opacity-80">
                {{ t(`helpCenter.support.from.${message.from}`) }} · {{ formatDate(message.at) }}
              </p>
              <p class="whitespace-pre-line">{{ message.body }}</p>
            </div>
          </li>
        </ol>

        <footer class="border-t border-surface-200 px-5 py-4">
          <form
            v-if="canReplyTicket(selected.status)"
            class="flex flex-col gap-2"
            novalidate
            @submit.prevent="sendReply"
          >
            <label for="ticket-reply" class="text-sm font-medium">{{
              t('helpCenter.support.reply')
            }}</label>
            <Textarea
              id="ticket-reply"
              v-model="reply"
              rows="3"
              auto-resize
              :maxlength="TICKET_REPLY_MAX"
              :placeholder="t('helpCenter.support.replyPlaceholder')"
              :invalid="Boolean(replyError)"
              :disabled="sending"
              fluid
            />
            <div class="flex items-center justify-between gap-3">
              <small v-if="replyError" class="text-red-600">{{
                t(replyError, { max: TICKET_REPLY_MAX })
              }}</small>
              <span v-else />
              <Button
                type="submit"
                :label="t('helpCenter.support.send')"
                icon="pi pi-send"
                size="small"
                :loading="sending"
                :disabled="!reply.trim()"
              />
            </div>
          </form>
          <Message v-else severity="secondary" :closable="false">
            {{ t('helpCenter.support.closed') }}
          </Message>
        </footer>
      </template>
    </section>
  </div>
</template>
