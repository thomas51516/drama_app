<script setup lang="ts">
import { useThemePrefs } from '../../composables/useThemePrefs'

/** Light/dark switch (`drama_theme` cookie), shared by the admin topbar and the recharge header. */
const { t } = useI18n()
const prefs = useThemePrefs()
</script>

<template>
  <Button
    :icon="prefs.isDark.value ? 'pi pi-sun' : 'pi pi-moon'"
    text
    rounded
    severity="secondary"
    size="small"
    :aria-label="t(prefs.isDark.value ? 'app.theme.switchToLight' : 'app.theme.switchToDark')"
    :title="t(prefs.isDark.value ? 'app.theme.switchToLight' : 'app.theme.switchToDark')"
    @click="prefs.toggle()"
  />
</template>
