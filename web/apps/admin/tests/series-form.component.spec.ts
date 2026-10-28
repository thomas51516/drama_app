import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SeriesForm from '#base/components/catalogue/SeriesForm.vue'
import { useAuthStore } from '#base/stores/auth'
import { mockCredentials } from '#base/mocks'
import type { AdminSeries } from '#base/types/api'
import seriesFixture from '#base/mocks/series.json'

async function signInAs(email: string): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('CatalogueSeriesForm (headless)', () => {
  it('shows French validation messages on an empty submit and emits nothing', async () => {
    await signInAs(mockCredentials.email)
    const wrapper = await mountSuspended(SeriesForm)
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain("Corrigez les champs en erreur avant d'enregistrer.")
    expect(text).toContain('Ce champ est obligatoire.')
    expect(text).toContain('Sélectionnez au moins un élément.')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('disables monetisation fields for an EDITOR and catalogue fields for MONETIZATION', async () => {
    await signInAs('editor@drama.local')
    const editor = await mountSuspended(SeriesForm, {
      props: { series: seriesFixture[0] as AdminSeries },
    })
    expect(editor.text()).toContain('Réservé aux rôles Monétisation et Administrateur.')
    expect((editor.find('#series-free-episodes').element as HTMLInputElement).disabled).toBe(true)
    expect((editor.find('#series-title').element as HTMLInputElement).disabled).toBe(false)

    await signInAs('money@drama.local')
    const money = await mountSuspended(SeriesForm, {
      props: { series: seriesFixture[0] as AdminSeries },
    })
    expect((money.find('#series-title').element as HTMLInputElement).disabled).toBe(true)
    expect((money.find('#series-free-episodes').element as HTMLInputElement).disabled).toBe(false)
  })
})
