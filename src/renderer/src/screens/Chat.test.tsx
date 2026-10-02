import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat'
import { useChatStore } from '../store/chatStore'
import { mockApi, ok, renderScreen } from '../test-utils'
import type { ChatToken } from '@shared/contract'

/** Tutor bubbles carry ruby pinyin, so match on the plain message text. */
async function findBubble(text: string): Promise<HTMLElement> {
  return waitFor(() => {
    const bubble = screen.getAllByTestId('bubble').find((b) => b.dataset.text === text)
    if (!bubble) throw new Error(`no bubble with text ${text}`)
    return bubble
  })
}

const settings = ok({
  hasKey: true,
  source: 'stored',
  encryptionAvailable: true,
  legacyKeyFile: false,
  dbPath: '/x'
})

describe('Chat', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('shows the key prompt when no key is set', async () => {
    mockApi({
      'settings:get': vi
        .fn()
        .mockResolvedValue(ok({ ...settings.value, hasKey: false, source: null }))
    })
    renderScreen(<Chat />, '/chat')
    expect(await screen.findByText('Chat needs an API key')).toBeInTheDocument()
  })

  it('greets, streams a reply and lists corrections', async () => {
    const user = userEvent.setup()
    let emit: ((token: ChatToken) => void) | null = null
    const start = vi.fn().mockResolvedValue(ok({ sessionId: 's1', greeting: '你好！' }))
    const send = vi.fn().mockImplementation(async () => {
      emit?.({ sessionId: 's1', turnId: 't1', text: '很' })
      emit?.({ sessionId: 's1', turnId: 't1', text: '好！' })
      return ok({
        turnId: 't1',
        reply: '很好！',
        errors: [
          {
            error_type: 'tone',
            span: 'ma',
            correction: '妈 (mā)',
            hanzi: '妈',
            explanation: 'First tone.',
            linked: true
          }
        ],
        added: ['妈'],
        encouragement: 'Nice!',
        analysisFailed: false
      })
    })
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(settings),
      'vocab:known': vi.fn().mockResolvedValue(ok(['很'])),
      'chat:start': start,
      'chat:send': send,
      onChatToken: vi.fn((listener: (token: ChatToken) => void) => {
        emit = listener
        return () => undefined
      })
    })

    renderScreen(<Chat />, '/chat')
    const greeting = await findBubble('你好！')
    expect(within(greeting).getByText('nǐ')).toBeInTheDocument()
    expect(start).toHaveBeenCalledWith({ level: 'medium' })

    await user.type(screen.getByPlaceholderText('Type in Chinese or English...'), '我ma很好')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith({ sessionId: 's1', text: '我ma很好' }))
    const reply = await findBubble('很好！')
    expect(reply.querySelector('ruby[data-known="true"]')).toHaveClass('pinyin-hidden')
    expect(within(reply).getByText('hǎo')).toBeInTheDocument()
    expect(screen.getByText('我ma很好')).toBeInTheDocument()
    expect(screen.getByText(/ma -> 妈 \(mā\)/)).toHaveTextContent('(added back to reviews)')
    expect(screen.getByText('added to your deck: 妈')).toBeInTheDocument()
    expect(screen.getByText('Nice!')).toBeInTheDocument()
  })

  it('restores the text and shows the error when sending fails', async () => {
    const user = userEvent.setup()
    mockApi({
      'settings:get': vi.fn().mockResolvedValue(settings),
      'chat:start': vi.fn().mockResolvedValue(ok({ sessionId: 's1', greeting: '你好！' })),
      'chat:send': vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'NETWORK', message: 'offline' } })
    })
    renderScreen(<Chat />, '/chat')
    await findBubble('你好！')
    const input = screen.getByPlaceholderText('Type in Chinese or English...')
    await user.type(input, '你好吗')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Error: offline')).toBeInTheDocument()
    await waitFor(() => expect(input).toHaveValue('你好吗'))
    expect(screen.queryByText('你好吗', { selector: 'div' })).not.toBeInTheDocument()
    await act(async () => {})
  })
})
