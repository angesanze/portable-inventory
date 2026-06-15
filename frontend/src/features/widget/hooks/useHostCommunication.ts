import { useEffect, useCallback, useRef } from 'react'

/**
 * PostMessage protocol types matching sdk/src/types.ts
 */
type PostMessageType = 'WIDGET_READY' | 'WIDGET_RESIZE' | 'WIDGET_EVENT' | 'HOST_COMMAND'

interface PostMessagePayload {
  type: PostMessageType
  source: 'portable-inventory-widget' | 'portable-inventory-host'
  payload: Record<string, unknown>
}

interface ThemeConfig {
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  borderRadius?: string
  fontFamily?: string
  compact?: boolean
}

interface HostCommandHandlers {
  onSetProduct?: (productId: string) => void
  onSetLocation?: (locationId: string) => void
  onSetTheme?: (theme: ThemeConfig) => void
}

interface HostCommunicationOptions {
  /** Allowed origin for incoming messages. Derived from parent window or API key config. */
  allowedOrigin?: string
  handlers: HostCommandHandlers
}

const WIDGET_VERSION = '0.1.0'
const WIDGET_SOURCE = 'portable-inventory-widget' as const

function sendToHost(type: PostMessageType, payload: Record<string, unknown>): void {
  if (window.parent === window) return // not in iframe
  window.parent.postMessage(
    { type, source: WIDGET_SOURCE, payload } satisfies PostMessagePayload,
    '*'
  )
}

/**
 * Sends WIDGET_READY on mount, handles HOST_COMMAND messages,
 * and provides sendTransactionEvent for notifying host of completed transactions.
 * Enhances existing ResizeObserver to use the full PostMessage protocol.
 */
export function useHostCommunication(options: HostCommunicationOptions) {
  const handlersRef = useRef(options.handlers)
  handlersRef.current = options.handlers

  // Send WIDGET_READY on mount
  useEffect(() => {
    sendToHost('WIDGET_READY', {
      version: WIDGET_VERSION,
      capabilities: ['setProduct', 'setLocation', 'setTheme', 'transactions'],
    })
  }, [])

  // Listen for HOST_COMMAND messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Origin validation: if allowedOrigin specified, reject mismatches
      if (options.allowedOrigin && event.origin !== options.allowedOrigin) return

      const data = event.data as PostMessagePayload
      if (!data || data.source !== 'portable-inventory-host' || data.type !== 'HOST_COMMAND') return

      const { command } = data.payload
      switch (command) {
        case 'setProduct':
          handlersRef.current.onSetProduct?.(String(data.payload.productId))
          break
        case 'setLocation':
          handlersRef.current.onSetLocation?.(String(data.payload.locationId))
          break
        case 'setTheme':
          handlersRef.current.onSetTheme?.(data.payload.theme as ThemeConfig)
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [options.allowedOrigin])

  // Send transaction event to host
  const sendTransactionEvent = useCallback(
    (detail: {
      transactionType: string
      productId: string | number
      quantity: number
      success: boolean
    }) => {
      sendToHost('WIDGET_EVENT', {
        eventType: 'transaction_complete',
        ...detail,
      })
    },
    []
  )

  // Send error event to host
  const sendErrorEvent = useCallback(
    (message: string, code?: string) => {
      sendToHost('WIDGET_EVENT', {
        eventType: 'error',
        message,
        code,
      })
    },
    []
  )

  return { sendTransactionEvent, sendErrorEvent, sendToHost }
}

/**
 * Enhanced ResizeObserver that sends WIDGET_RESIZE with full protocol format.
 * Replaces the raw postMessage in Widget.tsx.
 */
export function useWidgetResize(deps: unknown[]) {
  useEffect(() => {
    const sendHeight = () => {
      const height = document.documentElement.scrollHeight
      sendToHost('WIDGET_RESIZE', { height })
    }
    const observer = new ResizeObserver(sendHeight)
    observer.observe(document.body)
    observer.observe(document.documentElement)
    sendHeight()
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
