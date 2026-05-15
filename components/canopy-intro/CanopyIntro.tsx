'use client'

import { useState, useEffect, useRef } from 'react'

/* ═══════════════════════════════════════════════════════════
   CanopyIntro — Kinetic onboarding animation.

   5 cenas que rodam em loop, espelhando o estilo da intro
   Claude/Canopy:

     1. hero + prompt box typing
     2. prompt completo + cursor hover Send
     3. dialog overlay sobreposto a browser frame
     4. wireframe gallery + sticky notes
     5. deck slide + Share & Export dropdown

   Visual: pastel backgrounds, browser frame, big serif hero,
   typewriter cursor, organic cursor movement. CSS keyframes
   carregam a animação — JS apenas avança o índice de cena.
   ═══════════════════════════════════════════════════════════ */

export interface CanopyScene {
  /** Background color for this scene */
  bg: string
  /** Hero headline (large serif). Undefined hides hero. */
  hero?: string
  /** Prompt text. Use [TYPE]text[/TYPE] to mark typewriter portion. */
  promptText?: string
  /** Render mode for the central mockup */
  mockup: 'prompt' | 'dialog' | 'gallery' | 'deck-export'
  /** Caption above the prompt (used in dialog/gallery scenes) */
  caption?: string
  /** Browser URL bar text (only used when mockup includes a browser frame) */
  browserUrl?: string
  /** Hold duration in ms for this scene (defaults to 15000) */
  hold?: number
}

export interface CanopyIntroProps {
  /** Product name shown in the corner badge */
  productName: string
  /** Tagline for the corner badge */
  productTagline: string
  /** Accent color (CTA button, cursor highlight). Default coral. */
  accentColor?: string
  /** 5 scenes that play in sequence. */
  scenes: CanopyScene[]
  /** Optional href for "Continue →" CTA shown after intro ends. */
  continueHref?: string
  /** Text of the continue CTA. */
  continueLabel?: string
}

const DEFAULT_HOLD = 15000
const TRANSITION = 600

function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="canopy-browser">
      <div className="canopy-browser-bar">
        <span className="canopy-dot canopy-dot-red" />
        <span className="canopy-dot canopy-dot-yellow" />
        <span className="canopy-dot canopy-dot-green" />
        <div className="canopy-browser-url">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden="true">
            <rect x="1" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 5V3.5C2.5 2 3.5 1 5 1C6.5 1 7.5 2 7.5 3.5V5" stroke="currentColor" strokeWidth="1" />
          </svg>
          {url}
        </div>
      </div>
    </div>
  )
}

function PromptBox({ accent, text, showSendHover }: { accent: string; text: string; showSendHover: boolean }) {
  return (
    <div className="canopy-prompt">
      <div className="canopy-prompt-text">
        {text}
        <span className="canopy-caret" aria-hidden="true">|</span>
      </div>
      <div className="canopy-prompt-actions">
        <div className="canopy-prompt-tools">
          <span className="canopy-tool" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" />
            </svg>
          </span>
          <span className="canopy-tool" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 12.5L12 21.5C9.5 24 5.5 24 3 21.5C0.5 19 0.5 15 3 12.5L12 3.5C13.6 2 16.4 2 18 3.5C19.6 5 19.6 7.8 18 9.4L9 18.5" />
            </svg>
          </span>
          <span className="canopy-tool" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 21L21 3M14 3h7v7" />
            </svg>
          </span>
          <span className="canopy-tool canopy-tool-import">Import</span>
        </div>
        <button
          type="button"
          className={`canopy-send ${showSendHover ? 'is-hovered' : ''}`}
          style={{ background: accent }}
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <polygon points="4 4 22 12 4 20 8 12" />
          </svg>
          Send
        </button>
      </div>
    </div>
  )
}

function DialogOverlay({ url, prompt, accent }: { url: string; prompt: string; accent: string }) {
  return (
    <>
      <div className="canopy-split">
        <div className="canopy-split-dark" />
        <div className="canopy-split-light">
          <BrowserChrome url={url} />
          <div className="canopy-grid-bg" />
        </div>
      </div>
      <div className="canopy-dialog">
        <div className="canopy-dialog-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18" />
          </svg>
          my-app
          <span className="canopy-dialog-tag-x">×</span>
        </div>
        <div className="canopy-prompt-text">{prompt}</div>
        <div className="canopy-prompt-actions">
          <div className="canopy-prompt-tools">
            <span className="canopy-tool">⊞</span>
            <span className="canopy-tool">📎</span>
            <span className="canopy-tool">✎</span>
            <span className="canopy-tool canopy-tool-import">Import</span>
          </div>
          <button type="button" className="canopy-send" style={{ background: accent }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <polygon points="4 4 22 12 4 20 8 12" />
            </svg>
            Send
          </button>
        </div>
      </div>
      <span className="canopy-cursor canopy-cursor-dialog" />
    </>
  )
}

function GalleryMockup({ url }: { url: string }) {
  const cells = Array.from({ length: 6 })
  return (
    <div className="canopy-browser-full">
      <BrowserChrome url={url} />
      <div className="canopy-gallery">
        <div className="canopy-gallery-sidebar">
          <div className="canopy-skeleton w-65" />
          <div className="canopy-skeleton w-40" />
        </div>
        <div className="canopy-gallery-grid">
          {cells.map((_, i) => (
            <div key={i} className="canopy-card">
              <div className="canopy-card-thumb" />
              <div className="canopy-skeleton w-70" />
              <div className="canopy-skeleton w-45" />
            </div>
          ))}
        </div>
        <div className="canopy-sticky canopy-sticky-yellow">Thumbnails need hover state — show last-edited preview?</div>
        <div className="canopy-sticky canopy-sticky-green">Grid feels cramped at 3-up. Try 2-up on tablet</div>
      </div>
    </div>
  )
}

function DeckExportMockup({ url, accent }: { url: string; accent: string }) {
  return (
    <div className="canopy-browser-full">
      <BrowserChrome url={url} />
      <div className="canopy-deck">
        <div className="canopy-deck-toolbar">
          <span className="canopy-toolbar-btn">←</span>
          <span className="canopy-toolbar-btn">→</span>
          <span className="canopy-toolbar-btn">↻</span>
          <div style={{ flex: 1 }} />
          <span className="canopy-toolbar-btn is-light">⚙ Tweaks</span>
          <span className="canopy-toolbar-btn is-dark">↗ Share & export</span>
        </div>
        <div className="canopy-deck-slide">
          <div className="canopy-deck-half canopy-deck-half-dark">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#3ecf8e" strokeWidth="2.4">
              <path d="M6 28C6 16 14 8 22 8C30 8 38 16 38 28" />
              <path d="M14 28C14 22 18 16 22 16C26 16 30 22 30 28" />
            </svg>
          </div>
          <div className="canopy-deck-half canopy-deck-half-green">
            <div className="canopy-deck-h1">Let&apos;s grow together</div>
            <div className="canopy-deck-h2">hello@canopy.co</div>
          </div>
        </div>
        <div className="canopy-deck-counter">3 / 3</div>
        <div className="canopy-export-menu" style={{ ['--accent' as string]: accent } as React.CSSProperties}>
          <div className="canopy-export-item"><span className="canopy-export-icon">↓</span> Download HTML</div>
          <div className="canopy-export-item is-hover"><span className="canopy-export-icon">▦</span> Export to PPTX</div>
          <div className="canopy-export-divider" />
          <div className="canopy-export-item"><span className="canopy-export-icon">&lt;/&gt;</span> Export to Claude Code</div>
        </div>
        <span className="canopy-cursor canopy-cursor-export" />
      </div>
    </div>
  )
}

function SceneRenderer({ scene, accent }: { scene: CanopyScene; accent: string }) {
  return (
    <div className="canopy-scene" style={{ background: scene.bg }}>
      {scene.hero && <h1 className="canopy-hero">{scene.hero}</h1>}
      {scene.caption && <div className="canopy-caption">{scene.caption}</div>}

      {scene.mockup === 'prompt' && (
        <PromptBox accent={accent} text={scene.promptText ?? ''} showSendHover={false} />
      )}

      {scene.mockup === 'dialog' && (
        <DialogOverlay url={scene.browserUrl ?? ''} prompt={scene.promptText ?? ''} accent={accent} />
      )}

      {scene.mockup === 'gallery' && <GalleryMockup url={scene.browserUrl ?? ''} />}

      {scene.mockup === 'deck-export' && <DeckExportMockup url={scene.browserUrl ?? ''} accent={accent} />}
    </div>
  )
}

export function CanopyIntro({
  productName,
  productTagline,
  accentColor = '#dc6b3c',
  scenes,
  continueHref,
  continueLabel = 'Continue →',
}: CanopyIntroProps) {
  const [idx, setIdx] = useState(0)
  const [ended, setEnded] = useState(false)
  const timerRef = useRef<number | null>(null)

  const total = scenes.length

  useEffect(() => {
    if (ended || total === 0) return
    const hold = scenes[idx]?.hold ?? DEFAULT_HOLD
    timerRef.current = window.setTimeout(() => {
      if (idx + 1 >= total) setEnded(true)
      else setIdx(idx + 1)
    }, hold)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [idx, ended, total, scenes])

  function skipIntro() {
    setEnded(true)
  }

  function restart() {
    setIdx(0)
    setEnded(false)
  }

  return (
    <div className={`canopy-stage ${ended ? 'is-ended' : ''}`} style={{ ['--accent' as string]: accentColor } as React.CSSProperties}>
      <div className="canopy-frame">
        <div className="canopy-corner-badge">
          <div className="canopy-corner-kicker">{productName}</div>
          <div className="canopy-corner-line">{productTagline}</div>
        </div>

        <div className="canopy-track" style={{ transform: `translateX(${-idx * 100}%)` }}>
          {scenes.map((scene, i) => (
            <SceneRenderer key={i} scene={scene} accent={accentColor} />
          ))}
        </div>

        {!ended && (
          <button type="button" className="canopy-skip" onClick={skipIntro}>
            Skip intro
          </button>
        )}

        {!ended && (
          <div className="canopy-progress">
            {scenes.map((_, i) => (
              <span key={i} className={`canopy-progress-dot ${i === idx ? 'is-active' : i < idx ? 'is-done' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {ended && (
        <div className="canopy-end">
          <div className="canopy-end-card">
            <div className="canopy-end-kicker">{productName}</div>
            <div className="canopy-end-title">{productTagline}</div>
            <div className="canopy-end-actions">
              {continueHref && (
                <a className="canopy-end-cta" style={{ background: accentColor }} href={continueHref}>
                  {continueLabel}
                </a>
              )}
              <button type="button" className="canopy-end-replay" onClick={restart}>
                ↻ Rever intro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
