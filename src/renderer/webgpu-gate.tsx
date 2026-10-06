import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary } from '../components/error-boundary'
import type { RendererFailureReason } from './create-renderer'
import { detectWebGPU, type WebGPUUnsupportedReason } from './webgpu-support'

type GateFailure = WebGPUUnsupportedReason | RendererFailureReason
type GateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'failed'; reason: GateFailure; detail?: string }

const FAILURE_COPY: Record<GateFailure, { title: string; body: string }> = {
  'no-api': {
    title: 'This experiment needs WebGPU',
    body: 'Open it in a recent Chrome, Edge or Safari (version 26 or later) on desktop.',
  },
  'no-adapter': {
    title: 'No compatible GPU found',
    body: 'WebGPU is available but no GPU adapter was returned. Try updating your browser or graphics drivers.',
  },
  'init-failed': {
    title: 'The renderer failed to start',
    body: 'WebGPU could not be initialised on this device. Reload the page to try again.',
  },
  'device-lost': {
    title: 'The GPU connection was lost',
    body: 'Your graphics device was reset or removed. Reload the page to continue.',
  },
}

type ReportFailure = (reason: RendererFailureReason, detail: string) => void

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function WebGPUGate({ children }: { children: (reportFailure: ReportFailure) => ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    void detectWebGPU().then((support) => {
      if (cancelled) return
      setState(support.supported ? { status: 'ready' } : { status: 'failed', reason: support.reason })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const reportFailure = useCallback<ReportFailure>((reason, detail) => {
    setState({ status: 'failed', reason, detail })
  }, [])

  const handleBoundaryError = useCallback(
    (error: unknown) => reportFailure('init-failed', errorMessage(error)),
    [reportFailure],
  )

  if (state.status === 'checking') return null

  if (state.status === 'failed') {
    const copy = FAILURE_COPY[state.reason]
    return (
      <div className="gate" role="alert">
        <h1 className="gate__title">{copy.title}</h1>
        <p className="gate__body">{copy.body}</p>
      </div>
    )
  }

  return <ErrorBoundary onError={handleBoundaryError}>{children(reportFailure)}</ErrorBoundary>
}
