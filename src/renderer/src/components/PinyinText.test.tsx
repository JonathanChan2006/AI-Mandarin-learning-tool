import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PinyinText } from './PinyinText'

const known = new Set(['老师'])

function rubies(mode: 'new' | 'all' | 'hover'): HTMLElement[] {
  const { container } = render(<PinyinText text="老师好！" mode={mode} known={known} />)
  return [...container.querySelectorAll('ruby')] as HTMLElement[]
}

describe('PinyinText', () => {
  it('renders pinyin as ruby text over each character', () => {
    const { container } = render(<PinyinText text="老师好！" mode="all" known={known} />)
    expect([...container.querySelectorAll('rt')].map((rt) => rt.textContent)).toEqual([
      'lǎo',
      'shī',
      'hǎo'
    ])
    expect(container.textContent).toContain('！')
  })

  it('hides pinyin over known words in "new words" mode', () => {
    const [teacher, good] = rubies('new')
    expect(teacher).toHaveClass('pinyin-hidden')
    expect(teacher.dataset.known).toBe('true')
    expect(good).not.toHaveClass('pinyin-hidden')
  })

  it('shows everything in "all" mode and nothing in "hover" mode', () => {
    expect(rubies('all').some((r) => r.classList.contains('pinyin-hidden'))).toBe(false)
    expect(rubies('hover').every((r) => r.classList.contains('pinyin-hidden'))).toBe(true)
  })
})
