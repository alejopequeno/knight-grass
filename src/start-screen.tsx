import { useState } from 'react'

type Props = {
  onPlay: () => void
}

const CONTROLS: Array<{ keys: string[]; label: string }> = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Shift'], label: 'Run' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['LMB'], label: 'Attack' },
  { keys: ['RMB', 'Q'], label: 'Block' },
  { keys: ['Mouse'], label: 'Look around' },
]

export function StartScreen({ onPlay }: Props) {
  const [leaving, setLeaving] = useState(false)

  const handlePlay = () => {
    if (leaving) return
    setLeaving(true)
    // Wait for fade-out to finish before mounting the game so the user
    // doesn't see the splash flash off mid-transition.
    setTimeout(onPlay, 380)
  }

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
