import { useCallback, useState } from 'react'

type Props = {
  onPlay: () => void
}

type Control = { keys: string[]; label: string }

const CONTROLS: readonly Control[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Shift'], label: 'Run' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['LMB'], label: 'Attack' },
  { keys: ['RMB', 'Q'], label: 'Block' },
  { keys: ['Mouse'], label: 'Look around' },
]

// Should match the .start-screen opacity transition in index.css. We wait it
// out before mounting the game so the splash doesn't flash off mid-fade.
const FADE_OUT_MS = 380

export function StartScreen({ onPlay }: Props) {
  const [leaving, setLeaving] = useState(false)

  const handlePlay = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    setTimeout(onPlay, FADE_OUT_MS)
  }, [leaving, onPlay])

  return (
    <div className={`start-screen ${leaving ? 'start-screen--leaving' : ''}`}>
      <div className="start-screen__card">
        <div className="start-screen__eyebrow">a walk through the grass</div>
        <h1 className="start-screen__title">Knight Grass</h1>
        <p className="start-screen__subtitle">
          A small interactive sketch. Wander, run, swing, and rest.
        </p>

        <div className="start-screen__controls">
          {CONTROLS.map((row) => (
            <div className="start-screen__control" key={row.label}>
              <div className="start-screen__keys">
                {row.keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && <span className="start-screen__sep">/</span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </div>
              <span className="start-screen__label">{row.label}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handlePlay}
          className="start-screen__play"
          autoFocus
        >
          Play
        </button>

        <div className="start-screen__hint">
          Click the canvas after starting to capture the mouse for free-look.
        </div>
      </div>
    </div>
  )
}
