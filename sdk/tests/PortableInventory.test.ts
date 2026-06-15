import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PortableInventory } from '../src/PortableInventory'
import type { PostMessagePayload } from '../src/types'

describe('PortableInventory', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'widget-container'
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('constructor', () => {
    it('throws if apiKey is missing', () => {
      expect(
        () =>
          new PortableInventory({
            apiKey: '',
            container: '#widget-container',
          }),
      ).toThrow('apiKey is required')
    })

    it('throws if container is missing', () => {
      expect(
        () =>
          new PortableInventory({
            apiKey: 'test-key',
            container: '',
          }),
      ).toThrow('container is required')
    })

    it('creates instance with valid config', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        container: '#widget-container',
      })
      expect(widget).toBeInstanceOf(PortableInventory)
    })
  })

  describe('mount', () => {
    it('creates iframe inside container element', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container: '#widget-container',
      })

      widget.mount()

      const iframe = container.querySelector('iframe')
      expect(iframe).not.toBeNull()
      expect(iframe!.src).toContain('/widget?')
      expect(iframe!.src).toContain('api_key=test-key')
      expect(iframe!.style.width).toBe('100%')
      expect(iframe!.style.border).toBeFalsy() // jsdom normalizes 'none' to ''
      expect(iframe!.getAttribute('title')).toBe(
        'Varasto Widget',
      )
    })

    it('accepts HTMLElement as container', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      widget.mount()

      expect(container.querySelector('iframe')).not.toBeNull()
    })

    it('throws if container selector not found', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container: '#nonexistent',
      })

      expect(() => widget.mount()).toThrow('Container not found')
    })

    it('is idempotent — second mount does nothing', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      widget.mount()
      widget.mount()

      expect(container.querySelectorAll('iframe').length).toBe(1)
    })

    it('includes locale in widget URL when provided', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
        locale: 'fr',
      })

      widget.mount()

      const iframe = container.querySelector('iframe')!
      expect(iframe.src).toContain('locale=fr')
    })

    it('includes serialized theme in widget URL', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
        theme: { primaryColor: '#ff0000' },
      })

      widget.mount()

      const iframe = container.querySelector('iframe')!
      expect(iframe.src).toContain('theme=')
    })
  })

  describe('unmount', () => {
    it('removes iframe from container', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      widget.mount()
      expect(container.querySelector('iframe')).not.toBeNull()

      widget.unmount()
      expect(container.querySelector('iframe')).toBeNull()
    })

    it('is safe to call when not mounted', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      expect(() => widget.unmount()).not.toThrow()
    })

    it('allows remounting after unmount', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      widget.mount()
      widget.unmount()
      widget.mount()

      expect(container.querySelectorAll('iframe').length).toBe(1)
    })
  })

  describe('destroy', () => {
    it('unmounts and clears all listeners', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      const callback = vi.fn()
      widget.on('ready', callback)
      widget.mount()
      widget.destroy()

      expect(container.querySelector('iframe')).toBeNull()
    })
  })

  describe('event emitter (on/off)', () => {
    it('registers and fires event callbacks', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('ready', callback)

      // Simulate message from widget
      const message: PostMessagePayload = {
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: { version: '0.1.0', capabilities: ['move'] },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      expect(callback).toHaveBeenCalledWith({
        version: '0.1.0',
        capabilities: ['move'],
      })
    })

    it('removes callback with off()', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('ready', callback)
      widget.off('ready', callback)

      const message: PostMessagePayload = {
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: { version: '0.1.0', capabilities: [] },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      expect(callback).not.toHaveBeenCalled()
    })

    it('supports multiple listeners for same event', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const cb1 = vi.fn()
      const cb2 = vi.fn()
      widget.on('ready', cb1)
      widget.on('ready', cb2)

      const message: PostMessagePayload = {
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: { version: '0.1.0', capabilities: [] },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      expect(cb1).toHaveBeenCalled()
      expect(cb2).toHaveBeenCalled()
    })
  })

  describe('message handling', () => {
    it('ignores messages from wrong origin', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('ready', callback)

      const message: PostMessagePayload = {
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: { version: '0.1.0', capabilities: [] },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://evil.com',
        }),
      )

      expect(callback).not.toHaveBeenCalled()
    })

    it('ignores messages with wrong source', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('ready', callback)

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'WIDGET_READY',
            source: 'some-other-widget',
            payload: {},
          },
          origin: 'http://localhost:3000',
        }),
      )

      expect(callback).not.toHaveBeenCalled()
    })

    it('handles WIDGET_RESIZE by setting iframe height', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const message: PostMessagePayload = {
        type: 'WIDGET_RESIZE',
        source: 'portable-inventory-widget',
        payload: { height: 500 },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      const iframe = container.querySelector('iframe')!
      expect(iframe.style.height).toBe('500px')
    })

    it('handles WIDGET_EVENT with eventType', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('transaction_complete', callback)

      const message: PostMessagePayload = {
        type: 'WIDGET_EVENT',
        source: 'portable-inventory-widget',
        payload: {
          eventType: 'transaction_complete',
          transactionType: 'move',
          productId: '42',
          quantity: 5,
          success: true,
        },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'transaction_complete',
          productId: '42',
          quantity: 5,
          success: true,
        }),
      )
    })

    it('stops listening after unmount', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })
      widget.mount()

      const callback = vi.fn()
      widget.on('ready', callback)
      widget.unmount()

      const message: PostMessagePayload = {
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: { version: '0.1.0', capabilities: [] },
      }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: 'http://localhost:3000',
        }),
      )

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('setProduct / setLocation', () => {
    it('does not throw when iframe not present', () => {
      const widget = new PortableInventory({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:3000',
        container,
      })

      expect(() => widget.setProduct('123')).not.toThrow()
      expect(() => widget.setLocation('456')).not.toThrow()
    })
  })
})
