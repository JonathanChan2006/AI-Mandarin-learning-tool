import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { call } from './api'
import type { Input, Output } from '@shared/contract'

export const keys = {
  stats: ['stats'] as const,
  reviewQueue: ['review', 'queue'] as const,
  weak: (limit: number) => ['weak', limit] as const,
  mistakes: (limit: number, offset: number) => ['mistakes', limit, offset] as const,
  settings: ['settings'] as const,
  knownWords: ['vocab', 'known'] as const
}

/** Anything that changes cards, reviews or mistakes invalidates these. */
export function invalidateStudyData(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: keys.stats }),
    client.invalidateQueries({ queryKey: ['weak'] }),
    client.invalidateQueries({ queryKey: ['mistakes'] }),
    client.invalidateQueries({ queryKey: keys.reviewQueue }),
    client.invalidateQueries({ queryKey: ['vocab'] })
  ]).then(() => undefined)
}

export function useStats(): UseQueryResult<Output<'stats:get'>> {
  return useQuery({ queryKey: keys.stats, queryFn: () => call('stats:get') })
}

export function useReviewQueue(enabled = true): UseQueryResult<Output<'review:queue'>> {
  return useQuery({
    queryKey: keys.reviewQueue,
    queryFn: () => call('review:queue'),
    enabled,
    staleTime: Infinity
  })
}

export function useSettings(): UseQueryResult<Output<'settings:get'>> {
  return useQuery({ queryKey: keys.settings, queryFn: () => call('settings:get') })
}

export function useKnownWords(): UseQueryResult<Output<'vocab:known'>> {
  return useQuery({ queryKey: keys.knownWords, queryFn: () => call('vocab:known') })
}

export function useWeakItems(limit = 50): UseQueryResult<Output<'weak:list'>> {
  return useQuery({ queryKey: keys.weak(limit), queryFn: () => call('weak:list', { limit }) })
}

export function useMistakes(limit = 100, offset = 0): UseQueryResult<Output<'mistakes:list'>> {
  return useQuery({
    queryKey: keys.mistakes(limit, offset),
    queryFn: () => call('mistakes:list', { limit, offset })
  })
}

export function useGradeCard(): UseMutationResult<
  Output<'review:grade'>,
  Error,
  Input<'review:grade'>
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Input<'review:grade'>) => call('review:grade', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.stats })
      void client.invalidateQueries({ queryKey: ['weak'] })
      void client.invalidateQueries({ queryKey: ['mistakes'] })
      void client.invalidateQueries({ queryKey: ['vocab'] })
    }
  })
}

export function useAddCard(): UseMutationResult<Output<'items:add'>, Error, Input<'items:add'>> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Input<'items:add'>) => call('items:add', input),
    onSuccess: () => invalidateStudyData(client)
  })
}

export function useLoadSeed(): UseMutationResult<Output<'seed:load'>, Error, void> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => call('seed:load'),
    onSuccess: () => invalidateStudyData(client)
  })
}
