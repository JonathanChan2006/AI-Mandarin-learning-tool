import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Review from './Review'
import { mockApi, ok, queueItem, renderScreen } from '../test-utils'

describe('Review', () => {
  it('reveals with Space, grades with number keys and refills when the queue is empty', async () => {
    const user = userEvent.setup()
    const queue = vi
      .fn()
      .mockResolvedValueOnce(
        ok({ items: [queueItem(1, '一'), queueItem(2, '二')], nextDueAt: null })
      )
      .mockResolvedValueOnce(ok({ items: [], nextDueAt: null }))
    const grade = vi
      .fn()
      .mockResolvedValue(ok({ due: 1, intervalMs: 600_000, loggedMistake: false }))
    mockApi({ 'review:queue': queue, 'review:grade': grade })

    renderScreen(<Review />, '/review')

    expect(await screen.findByText('一')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByText('pinyin1')).not.toBeInTheDocument()

    await user.keyboard(' ')
    expect(screen.getByText('pinyin1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Good/ })).toHaveTextContent('+10m')

    await user.keyboard('3')
    await waitFor(() => expect(grade).toHaveBeenCalledWith({ itemId: 1, rating: 3 }))
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.queryByText('pinyin2')).not.toBeInTheDocument()

    await user.keyboard('1')
    expect(grade).toHaveBeenCalledTimes(1)

    await user.keyboard('{Enter}')
    await user.keyboard('4')
    await waitFor(() => expect(grade).toHaveBeenCalledWith({ itemId: 2, rating: 4 }))
    expect(await screen.findByText('Done for now.')).toBeInTheDocument()
    expect(screen.getByText('Reviewed 2 cards.')).toBeInTheDocument()
    expect(queue).toHaveBeenCalledTimes(2)
  })

  it('continues the session with cards that became due again', async () => {
    const user = userEvent.setup()
    const queue = vi
      .fn()
      .mockResolvedValueOnce(ok({ items: [queueItem(1, '一')], nextDueAt: null }))
      .mockResolvedValueOnce(ok({ items: [queueItem(1, '一')], nextDueAt: null }))
    const grade = vi.fn().mockResolvedValue(ok({ due: 1, intervalMs: 60_000, loggedMistake: true }))
    mockApi({ 'review:queue': queue, 'review:grade': grade })

    renderScreen(<Review />, '/review')
    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal' }))
    await user.click(screen.getByRole('button', { name: /Again/ }))
    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    expect(screen.queryByText('Done for now.')).not.toBeInTheDocument()
  })

  it('shows the done state straight away when nothing is due', async () => {
    mockApi({
      'review:queue': vi
        .fn()
        .mockResolvedValue(ok({ items: [], nextDueAt: Date.now() + 5 * 60_000 }))
    })
    renderScreen(<Review />, '/review')
    expect(await screen.findByText('Done for now.')).toBeInTheDocument()
    expect(screen.getByText('Reviewed 0 cards.')).toBeInTheDocument()
    expect(await screen.findByText(/Next card due in 5m/)).toBeInTheDocument()
  })
})
