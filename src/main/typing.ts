import { execFile } from 'child_process'
import { shell } from 'electron'
import { AppError } from '@shared/errors'

/**
 * Typing Chinese needs a pinyin input method from the operating system. The
 * app cannot turn one on (that is a system setting), but it can tell whether
 * one is enabled and send the user to the right settings page.
 */

export type TypingStatus = 'enabled' | 'missing' | 'unknown'
export type TypingPlatform = 'mac' | 'windows' | 'other'

export interface TypingInfo {
  status: TypingStatus
  platform: TypingPlatform
}

// Apple's Simplified/Traditional Chinese input methods and the common third-party ones.
const CHINESE_INPUT_SOURCE =
  /inputmethod\.(SCIM|TCIM)|sogou|baidu|squirrel|rime|wetype|qqinput|pinyin|zhuyin|wubi|cangjie/i

/** Output of `defaults read com.apple.HIToolbox AppleEnabledInputSources`. */
export function parseMacInputSources(output: string): TypingStatus {
  if (!output.trim()) return 'unknown'
  return CHINESE_INPUT_SOURCE.test(output) ? 'enabled' : 'missing'
}

/**
 * Output of `reg query "HKCU\Control Panel\International\User Profile" /v Languages`,
 * e.g. `Languages    REG_MULTI_SZ    en-GB\0zh-Hans-CN`. Installing a Chinese
 * language on Windows brings Microsoft Pinyin with it.
 */
export function parseWindowsLanguages(output: string): TypingStatus {
  const match = output.match(/Languages\s+REG_MULTI_SZ\s+(.+)/i)
  if (!match) return 'unknown'
  const languages = match[1].trim().split(/\\0|\s+/)
  return languages.some((language) => /^zh(-|$)/i.test(language)) ? 'enabled' : 'missing'
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 4000, windowsHide: true }, (error, stdout) =>
      resolve(error ? '' : stdout)
    )
  })
}

export async function typingInfo(
  platform: NodeJS.Platform = process.platform
): Promise<TypingInfo> {
  if (platform === 'darwin') {
    const output = await run('defaults', [
      'read',
      'com.apple.HIToolbox',
      'AppleEnabledInputSources'
    ])
    return { platform: 'mac', status: parseMacInputSources(output) }
  }
  if (platform === 'win32') {
    const output = await run('reg', [
      'query',
      'HKCU\\Control Panel\\International\\User Profile',
      '/v',
      'Languages'
    ])
    return { platform: 'windows', status: parseWindowsLanguages(output) }
  }
  return { platform: 'other', status: 'unknown' }
}

/** Deep link to the system page where an input method is added. */
export function keyboardSettingsUrl(
  platform: NodeJS.Platform,
  systemVersion: string
): string | null {
  if (platform === 'darwin') {
    const major = Number.parseInt(systemVersion.split('.')[0] ?? '', 10)
    // System Settings (macOS 13+) renamed the pane; System Preferences used the old id.
    return major >= 13
      ? 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'
      : 'x-apple.systempreferences:com.apple.preference.keyboard?Text'
  }
  if (platform === 'win32') return 'ms-settings:regionlanguage'
  return null
}

export async function openKeyboardSettings(): Promise<void> {
  const url = keyboardSettingsUrl(process.platform, process.getSystemVersion())
  if (!url) {
    throw new AppError(
      'NOT_FOUND',
      'Open your system keyboard settings and add a Chinese input method.'
    )
  }
  await shell.openExternal(url)
}
