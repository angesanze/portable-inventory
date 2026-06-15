import type {
  PortableInventoryConfig,
  WidgetEventMap,
  WidgetEventType,
  PostMessagePayload,
} from './types'
import { serializeTheme, DEFAULT_THEME } from './theme'

type EventCallback<T extends WidgetEventType> = (
  data: WidgetEventMap[T],
) => void

export class PortableInventory {
  private config: Required<
    Pick<PortableInventoryConfig, 'apiKey' | 'baseUrl'>
  > &
    PortableInventoryConfig
  private iframe: HTMLIFrameElement | null = null
  private containerEl: HTMLElement | null = null
  private listeners: Map<string, Set<EventCallback<WidgetEventType>>> =
    new Map()
  private messageHandler: ((event: MessageEvent) => void) | null = null
  private mounted = false

  /**
   * Exchange a short-lived QR token for the company API key.
   *
   * QR redirects (`/go/<code>/`) emit a signed, expiring token instead of
   * embedding the long-lived API key in the URL (browser history / log /
   * Referer leakage). Call this once with that token to obtain the key, then
   * pass it to `new PortableInventory({ apiKey, ... })`. Tokens expire after
   * ~10 minutes; on expiry the user must re-scan the QR.
   *
   * @param token   The `token` query param from the QR redirect URL.
   * @param baseUrl API origin (defaults to `window.location.origin`).
   * @returns The resolved API key.
   */
  static async exchangeToken(
    token: string,
    baseUrl: string = window.location.origin,
  ): Promise<string> {
    if (!token) throw new Error('token is required')
    const base = baseUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/api/v1/widget/exchange_token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      const detail = await res
        .json()
        .then((b) => b?.detail)
        .catch(() => undefined)
      throw new Error(detail ?? `Token exchange failed (${res.status})`)
    }
    const data = (await res.json()) as { api_key: string }
    return data.api_key
  }

  constructor(config: PortableInventoryConfig) {
    if (!config.apiKey) throw new Error('apiKey is required')
    if (!config.container) throw new Error('container is required')

    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? window.location.origin,
    }
  }

  mount(): void {
    if (this.mounted) return

    const container =
      typeof this.config.container === 'string'
        ? document.querySelector<HTMLElement>(this.config.container)
        : this.config.container

    if (!container) {
      throw new Error(
        `Container not found: ${this.config.container}`,
      )
    }

    this.containerEl = container
    this.iframe = document.createElement('iframe')

    const url = this.buildWidgetUrl()
    this.iframe.src = url
    this.iframe.style.width = '100%'
    this.iframe.style.border = 'none'
    this.iframe.style.overflow = 'hidden'
    this.iframe.setAttribute('title', 'Varasto Widget')

    this.setupMessageListener()
    container.appendChild(this.iframe)
    this.mounted = true
  }

  unmount(): void {
    if (!this.mounted) return

    if (this.iframe && this.containerEl?.contains(this.iframe)) {
      this.containerEl.removeChild(this.iframe)
    }
    this.iframe = null
    this.cleanupMessageListener()
    this.mounted = false
  }

  destroy(): void {
    this.unmount()
    this.listeners.clear()
    this.containerEl = null
  }

  on<T extends WidgetEventType>(
    event: T,
    callback: EventCallback<T>,
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners
      .get(event)!
      .add(callback as EventCallback<WidgetEventType>)
  }

  off<T extends WidgetEventType>(
    event: T,
    callback: EventCallback<T>,
  ): void {
    this.listeners
      .get(event)
      ?.delete(callback as EventCallback<WidgetEventType>)
  }

  setProduct(productId: string | number): void {
    this.sendCommand('setProduct', { productId })
  }

  setLocation(locationId: string | number): void {
    this.sendCommand('setLocation', { locationId })
  }

  private buildWidgetUrl(): string {
    const base = this.config.baseUrl.replace(/\/$/, '')
    const params = new URLSearchParams()
    params.set('api_key', this.config.apiKey)

    if (this.config.locale) {
      params.set('locale', this.config.locale)
    }

    if (this.config.mode && this.config.mode !== 'default') {
      params.set('mode', this.config.mode)
    }

    const theme = this.config.theme ?? DEFAULT_THEME
    params.set('theme', serializeTheme(theme))

    return `${base}/widget?${params.toString()}`
  }

  private sendCommand(
    command: string,
    data: Record<string, unknown>,
  ): void {
    if (!this.iframe?.contentWindow) return

    const origin = new URL(this.config.baseUrl).origin
    const message: PostMessagePayload = {
      type: 'HOST_COMMAND',
      source: 'portable-inventory-host',
      payload: { command, ...data },
    }
    this.iframe.contentWindow.postMessage(message, origin)
  }

  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      const expectedOrigin = new URL(this.config.baseUrl).origin
      if (event.origin !== expectedOrigin) return

      const data = event.data as PostMessagePayload
      if (data?.source !== 'portable-inventory-widget') return

      switch (data.type) {
        case 'WIDGET_READY':
          this.emit(
            'ready',
            data.payload as unknown as WidgetEventMap['ready'],
          )
          break
        case 'WIDGET_RESIZE':
          if (this.iframe && typeof data.payload.height === 'number') {
            this.iframe.style.height = `${data.payload.height}px`
          }
          this.emit(
            'resize',
            data.payload as unknown as WidgetEventMap['resize'],
          )
          break
        case 'WIDGET_EVENT': {
          const eventType = data.payload.eventType as
            | WidgetEventType
            | undefined
          if (eventType) {
            this.emit(
              eventType,
              data.payload as unknown as WidgetEventMap[typeof eventType],
            )
          }
          break
        }
      }
    }

    window.addEventListener('message', this.messageHandler)
  }

  private cleanupMessageListener(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
  }

  private emit<T extends WidgetEventType>(
    event: T,
    data: WidgetEventMap[T],
  ): void {
    const callbacks = this.listeners.get(event)
    if (!callbacks) return
    for (const cb of callbacks) {
      cb(data)
    }
  }
}
