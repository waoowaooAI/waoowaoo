import { describe, expect, it } from 'vitest'
import {
  AUTHENTICATED_HOME_PATHNAME,
  buildAuthenticatedHomeTarget,
} from '@/lib/home/default-route'

describe('authenticated home default target', () => {
  it('uses /home as the only authenticated default pathname', () => {
    expect(AUTHENTICATED_HOME_PATHNAME).toBe('/home')
    expect(buildAuthenticatedHomeTarget()).toEqual({
      pathname: '/home',
    })
  })
})
