import { describe, expect, it } from 'vitest'
import { backofficeModules, findModuleByPath } from '#base/utils/modules'

describe('back-office modules registry', () => {
  it('lists the 13 modules of spec section 5 in order', () => {
    expect(backofficeModules.map((m) => m.ticket)).toEqual(
      Array.from({ length: 13 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`),
    )
  })

  it('maps the catalogue to /series and unknown paths to undefined', () => {
    expect(findModuleByPath('/series')?.ticket).toBe('B-01')
    expect(findModuleByPath('/nope')).toBeUndefined()
  })
})
