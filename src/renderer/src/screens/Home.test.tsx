import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Home from './Home'
import { mockApi, ok, renderScreen } from '../test-utils'

describe('Home', () => {
  it('shows stats and the review button', async () => {
    mockApi({
      'stats:get': vi.fn().mockResolvedValue(ok({ words: 40, due: 3, reviews: 7, mistakes: 2 }))
    })
    renderScreen(<Home />)
    expect(await screen.findByText('40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review 3 due cards' })).toBeEnabled()
    expect(screen.queryByText('Your deck is empty.')).not.toBeInTheDocument()
  })

  it('offers the starter words when the deck is empty', async () => {
    const user = userEvent.setup()
    const seed = vi.fn().mockResolvedValue(ok({ added: 40, total: 40 }))
    mockApi({
      'stats:get': vi.fn().mockResolvedValue(ok({ words: 0, due: 0, reviews: 0, mistakes: 0 })),
      'seed:load': seed
    })
    renderScreen(<Home />)
    expect(await screen.findByText('Your deck is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review 0 due cards' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Load 40 starter words' }))
    expect(seed).toHaveBeenCalledTimes(1)
  })
})
