import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('i18n', () => {
  it('detects English browsers and defaults to Spanish', () => {
    expect(detectLocale(['en-US', 'es'])).toBe('en')
    expect(detectLocale(['EN'])).toBe('en')
    expect(detectLocale(['es-ES', 'en'])).toBe('es')
    expect(detectLocale(['zh-CN'])).toBe('es')
    expect(detectLocale([])).toBe('es')
    expect(detectLocale(undefined)).toBe('es')
  })

  it('lets a saved choice win over detection', () => {
    expect(resolveLocale('en', ['es-ES'])).toBe('en')
    expect(resolveLocale('es', ['en-US'])).toBe('es')
    expect(resolveLocale('', ['en-US'])).toBe('en')
  })

  it('has the same keys and placeholders in every language', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((es as Record<string, string>)[key]), key).toEqual(vars(value))
  })
})
