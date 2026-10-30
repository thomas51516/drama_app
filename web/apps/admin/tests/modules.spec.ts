import { describe, expect, it } from 'vitest'
import { backofficeModules, findModuleByPath, moduleAllowsRole } from '#base/utils/modules'

describe('back-office modules registry', () => {
  it('lists the 13 modules of spec section 5 in order, plus the help center (B-03bis)', () => {
    const numbered = backofficeModules.filter((m) => m.ticket !== 'B-03bis')
    expect(numbered.map((m) => m.ticket)).toEqual(
      Array.from({ length: 13 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`),
    )
    expect(backofficeModules.map((m) => m.ticket).indexOf('B-03bis')).toBe(3)
  })

  it('maps the catalogue to /series and unknown paths to undefined', () => {
    expect(findModuleByPath('/series')?.ticket).toBe('B-01')
    expect(findModuleByPath('/nope')).toBeUndefined()
  })

  it('points the sprint 3 modules to their real pages', () => {
    expect(findModuleByPath('/subtitles')?.ticket).toBe('B-03')
    expect(findModuleByPath('/featured')?.ticket).toBe('B-05')
    expect(findModuleByPath('/administration')?.ticket).toBe('B-13')
  })

  it('points the sprint 4 modules to their real pages', () => {
    expect(findModuleByPath('/schedule')?.ticket).toBe('B-04')
    expect(findModuleByPath('/dashboard')?.ticket).toBe('B-11')
  })

  it('points the sprint 5 modules to their real pages with their role gating', () => {
    const campaigns = findModuleByPath('/campaigns')
    expect(campaigns?.ticket).toBe('B-10')
    expect(moduleAllowsRole(campaigns!, 'MONETIZATION')).toBe(true)
    expect(moduleAllowsRole(campaigns!, 'ADMIN')).toBe(true)
    expect(moduleAllowsRole(campaigns!, 'EDITOR')).toBe(false)

    const helpCenter = findModuleByPath('/help-center')
    expect(helpCenter?.ticket).toBe('B-03bis')
    expect(helpCenter?.badge).toBe('supportInbox')
    expect(moduleAllowsRole(helpCenter!, 'EDITOR')).toBe(true)
    expect(moduleAllowsRole(helpCenter!, 'SUPPORT')).toBe(true)
    expect(moduleAllowsRole(helpCenter!, 'MONETIZATION')).toBe(false)

    expect(moduleAllowsRole(findModuleByPath('/series')!, 'SUPPORT')).toBe(true)
    expect(moduleAllowsRole(findModuleByPath('/series')!, null)).toBe(true)
  })
})
