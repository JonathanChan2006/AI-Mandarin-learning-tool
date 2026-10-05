import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import {
  answerFileDialogWith,
  buildLegacyDatabase,
  callBridge,
  launchApp,
  type Launched
} from './helpers'

let launched: Launched

test.beforeEach(async () => {
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.app.close()
})

test('first run: starter words, keyboard review, and the mistake shows up as a weak word', async () => {
  const { page } = launched

  await expect(page.getByText('Your deck is empty.')).toBeVisible()
  await page.getByRole('button', { name: 'Load 40 starter words' }).click()
  await page.getByRole('button', { name: 'Review 40 due cards' }).click()

  await expect(page.getByText('1 / 40')).toBeVisible()
  await expect(page.getByText('nǐ hǎo')).toBeHidden()
  await page.keyboard.press('Space')
  await expect(page.getByText('nǐ hǎo')).toBeVisible()
  await expect(page.getByRole('button', { name: /Good/ })).toContainText('+10m')

  await page.keyboard.press('1') // Again: reschedules the card and logs a mistake
  await expect(page.getByText('2 / 40')).toBeVisible()

  expect(await callBridge(page, 'stats:get')).toEqual({
    ok: true,
    value: { words: 40, due: 39, reviews: 1, mistakes: 1 }
  })

  await page.getByRole('link', { name: 'Weak' }).click()
  const weakRow = page.getByRole('listitem').filter({ hasText: '你好' })
  await expect(weakRow).toContainText('1.0')
  await page.getByRole('tab', { name: 'Mistake log' }).click()
  await expect(page.getByText('你好 (nǐ hǎo) = hello')).toBeVisible()
})

test('without an API key, Settings says so and Chat points there', async () => {
  const { page } = launched

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText('No key yet. The chat tutor needs one.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Typing Chinese' })).toBeVisible()

  await page.getByRole('link', { name: 'Chat' }).click()
  await expect(page.getByText('Chat needs an API key')).toBeVisible()
  await page.getByRole('button', { name: 'Open Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('imports the database from the Python version', async () => {
  const { app, page, userData } = launched
  const legacyPath = join(userData, 'python-mandarin.db')
  buildLegacyDatabase(legacyPath)
  await answerFileDialogWith(app, legacyPath)

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Import my old database' }).click()
  await expect(page.getByText('Imported 2 cards, 1 review and 1 mistake.')).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('button', { name: 'Review 2 due cards' })).toBeEnabled()

  await page.getByRole('link', { name: 'Weak' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '现在' })).toContainText('xiànzài')
})
