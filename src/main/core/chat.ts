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
  type Analysis,
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

/**
 * How a turn talks to Claude.
 *   sequential - reply, then a second call grades the message (the default).
 *   parallel   - the same two calls at the same time; the grader sees the
 *                tutor line the student was answering instead of the new reply.
 *   single     - one call that replies and reports its analysis via a tool.
 * The last two are experimental and exist so the designs can be compared.
 */
export type ChatMode = 'sequential' | 'parallel' | 'single'

export interface ChatServiceOptions {
  now?: () => Date
  log?: Pick<Console, 'warn'>
  mode?: ChatMode
}

/**
 * One chat turn: stream the tutor's reply, then grade the student's message,
 * log any slips against their flashcards and add new vocabulary as cards.
 */
export class ChatService {
  private readonly sessions = new Map<string, ChatSession>()
  private readonly now: () => Date
  private readonly log: Pick<Console, 'warn'>
  private readonly mode: ChatMode

  constructor(
    private readonly db: Db,
    private readonly makeTutor: () => Tutor,
    options: ChatServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? console
    this.mode = options.mode ?? 'sequential'
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
    this.remember(sessionId, level, greeting)
    return { sessionId, greeting }
  }

  /** Open a session from a tutor line that is already known, without calling the API. */
  open(level: Level, tutorOpening: string): string {
    const sessionId = randomUUID()
    this.remember(sessionId, level, tutorOpening)
    return sessionId
  }

  private remember(sessionId: string, level: Level, tutorOpening: string): void {
    this.sessions.set(sessionId, {
      id: sessionId,
      level,
      history: [
        { role: 'user', content: GREETING_PROMPT },
        { role: 'assistant', content: tutorOpening }
      ]
    })
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
    const system = this.systemPrompt(session.level)
    const stream = (chunk: string): void => onToken?.({ sessionId, turnId, text: chunk })

    let reply: string
    let analysis: Analysis | null
    if (this.mode === 'single') {
      ;({ reply, analysis } = await tutor.replyAndAnalyze(system, attempt, stream))
    } else if (this.mode === 'parallel') {
      const asked = lastTutorLine(session.history)
      ;[reply, analysis] = await Promise.all([
        tutor.reply(system, attempt, stream),
        this.gradeQuietly(tutor, text, asked)
      ])
    } else {
      reply = await tutor.reply(system, attempt, stream)
      analysis = await this.gradeQuietly(tutor, text, reply)
    }
    session.history = [...attempt, { role: 'assistant', content: reply }]

    const analysisFailed = analysis === null
    analysis ??= EMPTY_ANALYSIS

    const errors = analysis.errors.map((error) => ({
      ...error,
      linked: registerConversationError(this.db, error, this.now())
    }))
    const added = addStudyWords(this.db, analysis.study_words, 'chat', this.now())

    return { turnId, reply, errors, added, encouragement: analysis.encouragement, analysisFailed }
  }

  /** A failed grading pass must never cost the student their reply. */
  private async gradeQuietly(
    tutor: Tutor,
    text: string,
    tutorLine: string
  ): Promise<Analysis | null> {
    try {
      return await tutor.analyze(text, tutorLine)
    } catch (error) {
      this.log.warn('[chat] analysis failed; the reply is kept', error)
      return null
    }
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

function lastTutorLine(history: ChatMessageParam[]): string {
  const last = [...history].reverse().find((message) => message.role === 'assistant')
  return typeof last?.content === 'string' ? last.content : ''
}
