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
    title: 'Este experimento necesita WebGPU',
    body: 'Abrilo en un Chrome, Edge o Safari (versión 26 o posterior) reciente, en escritorio.',
  },
  'no-adapter': {
    title: 'No se encontró una GPU compatible',
    body: 'WebGPU está disponible pero no devolvió ningún adaptador. Probá actualizar el navegador o los drivers de video.',
  },
  'init-failed': {
    title: 'El renderer no pudo arrancar',
    body: 'WebGPU no se pudo inicializar en este dispositivo. Recargá la página para intentar de nuevo.',
  },
  'device-lost': {
    title: 'Se perdió la conexión con la GPU',
    body: 'La placa de video se reinició o se desconectó. Recargá la página para continuar.',
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
