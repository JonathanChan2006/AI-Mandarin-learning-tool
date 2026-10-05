import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

import { keyboardSettingsUrl, parseMacInputSources, parseWindowsLanguages } from './typing'

const MAC_ABC_ONLY = `(
        {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout ID" = 252;
        "KeyboardLayout Name" = ABC;
    },
        {
        "Bundle ID" = "com.apple.CharacterPaletteIM";
        InputSourceKind = "Non Keyboard Input Method";
    },
        {
        "Bundle ID" = "com.apple.PressAndHold";
        InputSourceKind = "Non Keyboard Input Method";
    }
)`

const MAC_WITH_PINYIN = `(
        {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout Name" = ABC;
    },
        {
        "Bundle ID" = "com.apple.inputmethod.SCIM";
        "Input Mode" = "com.apple.inputmethod.SCIM.ITABC";
        InputSourceKind = "Input Mode";
    }
)`

describe('parseMacInputSources', () => {
  it('reports missing when only a Latin layout is enabled', () => {
    expect(parseMacInputSources(MAC_ABC_ONLY)).toBe('missing')
  })

  it('recognises Apple and third-party Chinese input methods', () => {
    expect(parseMacInputSources(MAC_WITH_PINYIN)).toBe('enabled')
    expect(parseMacInputSources('"Bundle ID" = "com.apple.inputmethod.TCIM";')).toBe('enabled')
    expect(parseMacInputSources('"Bundle ID" = "com.sogou.inputmethod.sogou";')).toBe('enabled')
    expect(parseMacInputSources('"Bundle ID" = "im.rime.inputmethod.Squirrel";')).toBe('enabled')
  })

  it('is unknown when the command gave nothing', () => {
    expect(parseMacInputSources('')).toBe('unknown')
  })
})

describe('parseWindowsLanguages', () => {
  const row = (languages: string): string =>
    `\r\nHKEY_CURRENT_USER\\Control Panel\\International\\User Profile\r\n    Languages    REG_MULTI_SZ    ${languages}\r\n`

  it('looks for an installed Chinese language', () => {
    expect(parseWindowsLanguages(row('en-GB'))).toBe('missing')
    expect(parseWindowsLanguages(row('en-GB\\0zh-Hans-CN'))).toBe('enabled')
    expect(parseWindowsLanguages(row('zh-TW\\0en-US'))).toBe('enabled')
    expect(parseWindowsLanguages(row('en-US\\0zu-ZA'))).toBe('missing')
  })

  it('is unknown when the registry value is absent', () => {
    expect(
      parseWindowsLanguages('ERROR: The system was unable to find the specified registry key')
    ).toBe('unknown')
  })
})

describe('keyboardSettingsUrl', () => {
  it('uses the System Settings pane on macOS 13 and later', () => {
    expect(keyboardSettingsUrl('darwin', '13.6.0')).toBe(
      'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'
    )
    expect(keyboardSettingsUrl('darwin', '15.1')).toContain('Keyboard-Settings.extension')
    expect(keyboardSettingsUrl('darwin', '12.7.1')).toBe(
      'x-apple.systempreferences:com.apple.preference.keyboard?Text'
    )
  })

  it('uses the language page on Windows and nothing elsewhere', () => {
    expect(keyboardSettingsUrl('win32', '10.0.22631')).toBe('ms-settings:regionlanguage')
    expect(keyboardSettingsUrl('linux', '6.8')).toBeNull()
  })
})
