export interface ThemeConfig {
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  borderRadius?: string
  fontFamily?: string
  compact?: boolean
}

export interface PortableInventoryConfig {
  apiKey: string
  baseUrl?: string
  container: string | HTMLElement
  theme?: ThemeConfig
  locale?: string
  /** Widget display mode. 'scan' renders QR scanner as initial view. */
  mode?: 'scan' | 'default'
}

export type WidgetEventType =
  | 'ready'
  | 'resize'
  | 'transaction_complete'
  | 'error'

export interface WidgetEvent {
  type: WidgetEventType
  data?: Record<string, unknown>
}

export interface WidgetEventMap {
  ready: { version: string; capabilities: string[] }
  resize: { height: number }
  transaction_complete: {
    transactionType: string
    productId: string | number
    quantity: number
    success: boolean
  }
  error: { message: string; code?: string }
}

export type PostMessageType =
  | 'WIDGET_READY'
  | 'WIDGET_RESIZE'
  | 'WIDGET_EVENT'
  | 'HOST_COMMAND'

export interface PostMessagePayload {
  type: PostMessageType
  source: 'portable-inventory-widget' | 'portable-inventory-host'
  payload: Record<string, unknown>
}
