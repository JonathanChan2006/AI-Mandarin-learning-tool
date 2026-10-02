import { randomUUID } from 'node:crypto'
import type { Db } from './db'
import { activeWords, addStudyWords } from './items'
import { weakItems } from './mistakes'
import { registerConversationError } from './review'
import {
  buildTutorSystem,
  describeWord,
  EMPTY_ANALYSIS,
  GREETING_PROMPT,
  type ChatMessageParam,
  type Tutor
} from './tutor'
import type { ChatToken, TurnResult } from '@shared/contract'
import { AppError } from '@shared/errors'
import type { Level } from '@shared/types'

export interface ChatSession {
  id: string
  level: Level
  history: ChatMessageParam[]
}

/** Weak words are refreshed from the database on every turn, never cached. */
export const WEAK_WORDS_IN_PROMPT = 8
export const ACTIVE_WORDS_IN_PROMPT = 12

export interface ChatServiceOptions {
  now?: () => Date
  log?: Pick<Console, 'warn'>
}

/**
 * One chat turn: stream the tutor's reply, then grade the student's message,
 * log any slips against their flashcards and add new vocabulary as cards.
 */
export class ChatService {
  private readonly sessions = new Map<string, ChatSession>()
  private readonly now: () => Date
  private readonly log: Pick<Console, 'warn'>

  constructor(
    private readonly db: Db,
    private readonly makeTutor: () => Tutor,
    options: ChatServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? console
  }

  /** Open a session at the given level; the tutor greets first. */
  async start(
    level: Level,
    onToken?: (token: ChatToken) => void
  ): Promise<{ sessionId: string; greeting: string }> {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    const opening: ChatMessageParam[] = [{ role: 'user', content: GREETING_PROMPT }]
    const greeting = await this.makeTutor().reply(this.systemPrompt(level), opening, (text) =>
      onToken?.({ sessionId, turnId, text })
    )
    this.sessions.set(sessionId, {
      id: sessionId,
      level,
      history: [...opening, { role: 'assistant', content: greeting }]
    })
    return { sessionId, greeting }
  }

  async send(
    sessionId: string,
    text: string,
    onToken?: (token: ChatToken) => void
  ): Promise<TurnResult> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new AppError('NOT_FOUND', 'That chat has expired. Start a new one.')
    const turnId = randomUUID()
    const tutor = this.makeTutor()

    // The user turn only joins the history once the tutor has answered it.
    const attempt: ChatMessageParam[] = [...session.history, { role: 'user', content: text }]
    const reply = await tutor.reply(this.systemPrompt(session.level), attempt, (chunk) =>
      onToken?.({ sessionId, turnId, text: chunk })
    )
    session.history = [...attempt, { role: 'assistant', content: reply }]

    let analysis = EMPTY_ANALYSIS
    let analysisFailed = false
    try {
      analysis = await tutor.analyze(text, reply)
    } catch (error) {
      analysisFailed = true
      this.log.warn('[chat] analysis failed; the reply is kept', error)
    }

    const errors = analysis.errors.map((error) => ({
      ...error,
      linked: registerConversationError(this.db, error, this.now())
    }))
    const added = addStudyWords(this.db, analysis.study_words, 'chat', this.now())

    return { turnId, reply, errors, added, encouragement: analysis.encouragement, analysisFailed }
  }

  end(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId)
  }

  private systemPrompt(level: Level): string {
    const weak = weakItems(this.db, this.now(), WEAK_WORDS_IN_PROMPT).map(describeWord)
    const active = activeWords(this.db, ACTIVE_WORDS_IN_PROMPT).map(describeWord)
    return buildTutorSystem(weak, active, level)
  }
}
