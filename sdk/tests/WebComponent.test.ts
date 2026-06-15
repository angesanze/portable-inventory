import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PortableInventoryElement } from '../src/WebComponent'

// Register custom element for tests (guard against double registration)
if (!customElements.get('portable-inventory-test')) {
  customElements.define('portable-inventory-test', PortableInventoryElement)
}

describe('PortableInventoryElement', () => {
  let element: PortableInventoryElement

  beforeEach(() => {
    element = document.createElement(
      'portable-inventory-test',
    ) as PortableInventoryElement
  })

  afterEach(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element)
    }
  })

  describe('observedAttributes', () => {
    it('lists all expected attributes', () => {
      const attrs = PortableInventoryElement.observedAttributes
      expect(attrs).toContain('api-key')
      expect(attrs).toContain('base-url')
      expect(attrs).toContain('product-id')
      expect(attrs).toContain('location-id')
      expect(attrs).toContain('theme-primary')
      expect(attrs).toContain('theme-bg')
      expect(attrs).toContain('theme-text')
      expect(attrs).toContain('theme-radius')
      expect(attrs).toContain('theme-font')
      expect(attrs).toContain('compact')
      expect(attrs.length).toBe(10)
    })
  })

  describe('connectedCallback', () => {
    it('creates shadow DOM with widget container when api-key set', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      const shadow = element.shadowRoot!
      expect(shadow).not.toBeNull()
      expect(shadow.querySelector('div')).not.toBeNull()
      // Widget mounts iframe inside shadow container
      expect(shadow.querySelector('iframe')).not.toBeNull()
    })

    it('does not mount widget without api-key', () => {
      document.body.appendChild(element)

      const shadow = element.shadowRoot!
      expect(shadow.querySelector('iframe')).toBeNull()
    })

    it('sets iframe src with correct api_key param', () => {
      element.setAttribute('api-key', 'my-key-123')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      const iframe = element.shadowRoot!.querySelector('iframe')!
      expect(iframe.src).toContain('api_key=my-key-123')
    })
  })

  describe('disconnectedCallback', () => {
    it('cleans up shadow DOM on removal', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      expect(element.shadowRoot!.querySelector('iframe')).not.toBeNull()

      document.body.removeChild(element)

      expect(element.shadowRoot!.querySelector('iframe')).toBeNull()
    })
  })

  describe('attributeChangedCallback', () => {
    it('reconnects when api-key changes', () => {
      element.setAttribute('api-key', 'key-1')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      const iframeBefore = element.shadowRoot!.querySelector('iframe')!
      expect(iframeBefore.src).toContain('api_key=key-1')

      element.setAttribute('api-key', 'key-2')

      const iframeAfter = element.shadowRoot!.querySelector('iframe')!
      expect(iframeAfter.src).toContain('api_key=key-2')
    })

    it('reconnects when theme attribute changes', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      // Change theme — should reconnect
      element.setAttribute('theme-primary', '#ff0000')

      const iframe = element.shadowRoot!.querySelector('iframe')!
      expect(iframe).not.toBeNull()
      // Widget is re-created so iframe still present
      expect(iframe.src).toContain('theme=')
    })

    it('does nothing when attribute value unchanged', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      document.body.appendChild(element)

      const iframe = element.shadowRoot!.querySelector('iframe')!
      const srcBefore = iframe.src

      // Setting same value — attributeChangedCallback guards against oldValue === newValue
      // jsdom still fires callback but with same old/new, so widget stays intact
      element.setAttribute('api-key', 'test-key')

      const iframeAfter = element.shadowRoot!.querySelector('iframe')!
      expect(iframeAfter.src).toBe(srcBefore)
    })
  })

  describe('buildTheme', () => {
    it('passes theme attributes to widget', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      element.setAttribute('theme-primary', '#00ff00')
      document.body.appendChild(element)

      const iframe = element.shadowRoot!.querySelector('iframe')!
      // Theme gets serialized into URL
      expect(iframe.src).toContain('theme=')
    })

    it('handles compact as boolean attribute', () => {
      element.setAttribute('api-key', 'test-key')
      element.setAttribute('base-url', 'http://localhost:3000')
      element.setAttribute('compact', '')
      document.body.appendChild(element)

      // compact presence = true — widget should mount fine
      expect(element.shadowRoot!.querySelector('iframe')).not.toBeNull()
    })
  })
})
