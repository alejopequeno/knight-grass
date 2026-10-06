import { useStoryAnnouncement } from './story-announcer'

export function StoryLiveRegion() {
  const message = useStoryAnnouncement()
  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="story-live">
      {message}
    </div>
  )
}
