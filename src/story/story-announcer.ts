import { useSyncExternalStore } from 'react'

// Latest story message for the aria-live region. A tiny external store so an
// announcement re-renders only the live region, not the whole Canvas tree.
let message = ''
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function announceStory(next: string): void {
  if (next === message) return
  message = next
  listeners.forEach((listener) => listener())
}

export function useStoryAnnouncement(): string {
  return useSyncExternalStore(subscribe, () => message)
}
