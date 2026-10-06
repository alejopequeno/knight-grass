import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  onError: (error: unknown) => void
  fallback?: ReactNode
}

// Minimal boundary: reports the error upward and renders `fallback` (nothing
// by default). The parent decides what the user sees.
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }

  render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
