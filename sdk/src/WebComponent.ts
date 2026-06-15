import { PortableInventory } from './PortableInventory'
import type { ThemeConfig } from './types'

export class PortableInventoryElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      'api-key',
      'base-url',
      'product-id',
      'location-id',
      'mode',
      'theme-primary',
      'theme-bg',
      'theme-text',
      'theme-radius',
      'theme-font',
      'compact',
    ]
  }

  private widget: PortableInventory | null = null
  private shadow: ShadowRoot

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    const apiKey = this.getAttribute('api-key')
    if (!apiKey) return

    const container = document.createElement('div')
    container.style.width = '100%'
    this.shadow.appendChild(container)

    const mode = this.getAttribute('mode') as 'scan' | 'default' | null
    this.widget = new PortableInventory({
      apiKey,
      baseUrl: this.getAttribute('base-url') ?? undefined,
      container,
      theme: this.buildTheme(),
      mode: mode ?? undefined,
    })

    this.widget.mount()

    const productId = this.getAttribute('product-id')
    if (productId) this.widget.setProduct(productId)

    const locationId = this.getAttribute('location-id')
    if (locationId) this.widget.setLocation(locationId)
  }

  disconnectedCallback(): void {
    this.widget?.destroy()
    this.widget = null
    this.shadow.innerHTML = ''
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue || !this.widget) return

    switch (name) {
      case 'product-id':
        if (newValue) this.widget.setProduct(newValue)
        break
      case 'location-id':
        if (newValue) this.widget.setLocation(newValue)
        break
      case 'api-key':
      case 'base-url':
      case 'mode':
      case 'theme-primary':
      case 'theme-bg':
      case 'theme-text':
      case 'theme-radius':
      case 'theme-font':
      case 'compact':
        this.reconnect()
        break
    }
  }

  private reconnect(): void {
    this.disconnectedCallback()
    this.connectedCallback()
  }

  private buildTheme(): ThemeConfig {
    return {
      primaryColor: this.getAttribute('theme-primary') ?? undefined,
      backgroundColor: this.getAttribute('theme-bg') ?? undefined,
      textColor: this.getAttribute('theme-text') ?? undefined,
      borderRadius: this.getAttribute('theme-radius') ?? undefined,
      fontFamily: this.getAttribute('theme-font') ?? undefined,
      compact: this.hasAttribute('compact'),
    }
  }
}
