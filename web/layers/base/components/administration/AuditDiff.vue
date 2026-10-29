<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AuditLog } from '../../types/api'
import { changedLines, diffAuditValues, formatJson, formatJsonValue } from '../../utils/audit-diff'

/** Expanded row of the audit table: changed keys highlighted, raw JSON on demand. */
const props = defineProps<{ log: AuditLog }>()
const { t } = useI18n()

const lines = computed(() => diffAuditValues(props.log.oldValue, props.log.newValue))
const changed = computed(() => changedLines(lines.value))
const showAll = ref(false)
const showRaw = ref(false)
const visible = computed(() => (showAll.value ? lines.value : changed.value))

const rowClass: Record<string, string> = {
  added: 'bg-green-50',
  removed: 'bg-red-50',
  changed: 'bg-amber-50',
  same: '',
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3 text-sm" data-testid="audit-diff">
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-color">
      <dt>{{ t('administration.audit.columns.target') }}</dt>
      <dd class="font-mono">
        {{ log.targetType }}<span v-if="log.targetId"> · {{ log.targetId }}</span>
      </dd>
      <dt>{{ t('administration.audit.columns.ip') }}</dt>
      <dd class="font-mono">{{ log.ip ?? '—' }}</dd>
      <dt>{{ t('administration.audit.id') }}</dt>
      <dd class="font-mono">{{ log.id }}</dd>
    </dl>

    <p v-if="lines.length === 0" class="text-muted-color">
      {{ t('administration.audit.noValues') }}
    </p>
    <table
      v-else
      class="w-full table-fixed border-collapse overflow-hidden rounded-md border border-surface-200"
    >
      <thead class="bg-surface-100 text-left text-xs uppercase text-muted-color">
        <tr>
          <th class="w-40 px-3 py-2">{{ t('administration.audit.diff.field') }}</th>
          <th class="px-3 py-2">{{ t('administration.audit.diff.before') }}</th>
          <th class="px-3 py-2">{{ t('administration.audit.diff.after') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="line in visible"
          :key="line.key"
          :class="rowClass[line.status]"
          class="border-t border-surface-200 align-top"
          :data-status="line.status"
        >
          <td
            class="px-3 py-2 font-mono text-xs"
            :class="line.status !== 'same' ? 'font-semibold' : ''"
          >
            {{ line.key || '—' }}
          </td>
          <td class="px-3 py-2">
            <pre
              class="whitespace-pre-wrap break-words font-mono text-xs"
              :class="
                line.status === 'changed' || line.status === 'removed'
                  ? 'text-red-700 line-through decoration-red-300'
                  : ''
              "
              >{{ formatJsonValue(line.before) }}</pre>
          </td>
          <td class="px-3 py-2">
            <pre
              class="whitespace-pre-wrap break-words font-mono text-xs"
              :class="line.status === 'changed' || line.status === 'added' ? 'text-green-800' : ''"
              >{{ formatJsonValue(line.after) }}</pre>
          </td>
        </tr>
        <tr v-if="visible.length === 0" class="border-t border-surface-200">
          <td colspan="3" class="px-3 py-2 text-muted-color">
            {{ t('administration.audit.diff.noChange') }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex flex-wrap gap-2">
      <Button
        v-if="changed.length !== lines.length"
        :label="
          showAll
            ? t('administration.audit.diff.onlyChanged')
            : t('administration.audit.diff.showAll', { count: lines.length })
        "
        size="small"
        text
        @click="showAll = !showAll"
      />
      <Button
        :label="
          showRaw ? t('administration.audit.diff.hideRaw') : t('administration.audit.diff.showRaw')
        "
        size="small"
        text
        severity="secondary"
        @click="showRaw = !showRaw"
      />
    </div>
    <div v-if="showRaw" class="grid gap-3 md:grid-cols-2">
      <div>
        <p class="mb-1 text-xs uppercase text-muted-color">
          {{ t('administration.audit.diff.before') }}
        </p>
        <pre
          class="overflow-x-auto rounded-md bg-surface-900 p-3 font-mono text-xs text-surface-100"
          >{{ formatJson(log.oldValue) }}</pre>
      </div>
      <div>
        <p class="mb-1 text-xs uppercase text-muted-color">
          {{ t('administration.audit.diff.after') }}
        </p>
        <pre
          class="overflow-x-auto rounded-md bg-surface-900 p-3 font-mono text-xs text-surface-100"
          >{{ formatJson(log.newValue) }}</pre>
      </div>
    </div>
  </div>
</template>
