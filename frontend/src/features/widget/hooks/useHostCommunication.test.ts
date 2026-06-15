import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useHostCommunication, useWidgetResize } from './useHostCommunication'

// Mock ResizeObserver
vi.stubGlobal('ResizeObserver', class ResizeObserver {
  private cb: () => void
  constructor(cb: () => void) { this.cb = cb }
  observe() { this.cb() }
  unobserve() {}
  disconnect() {}
})

describe('useHostCommunication', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>
  const originalParent = window.parent

  beforeEach(() => {
    // Simulate being inside an iframe
    postMessageSpy = vi.fn()
    Object.defineProperty(window, 'parent', {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('sends WIDGET_READY on mount', () => {
    renderHook(() =>
      useHostCommunication({ handlers: {} })
    )

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WIDGET_READY',
        source: 'portable-inventory-widget',
        payload: expect.objectContaining({
          version: '0.1.0',
          capabilities: expect.arrayContaining(['setProduct', 'setLocation', 'setTheme']),
        }),
      }),
      '*'
    )
  })

  it('handles HOST_COMMAND setProduct', () => {
    const onSetProduct = vi.fn()
    renderHook(() =>
      useHostCommunication({ handlers: { onSetProduct } })
    )

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'HOST_COMMAND',
            source: 'portable-inventory-host',
            payload: { command: 'setProduct', productId: 'p123' },
          },
        })
      )
    })

    expect(onSetProduct).toHaveBeenCalledWith('p123')
  })

  it('handles HOST_COMMAND setLocation', () => {
    const onSetLocation = vi.fn()
    renderHook(() =>
      useHostCommunication({ handlers: { onSetLocation } })
    )

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'HOST_COMMAND',
            source: 'portable-inventory-host',
            payload: { command: 'setLocation', locationId: 'loc456' },
          },
        })
      )
    })

    expect(onSetLocation).toHaveBeenCalledWith('loc456')
  })

  it('handles HOST_COMMAND setTheme', () => {
    const onSetTheme = vi.fn()
    renderHook(() =>
      useHostCommunication({ handlers: { onSetTheme } })
    )

    const theme = { primaryColor: '#ff0000', compact: true }
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'HOST_COMMAND',
            source: 'portable-inventory-host',
            payload: { command: 'setTheme', theme },
          },
        })
      )
    })

    expect(onSetTheme).toHaveBeenCalledWith(theme)
  })

  it('ignores messages from wrong source', () => {
    const onSetProduct = vi.fn()
    renderHook(() =>
      useHostCommunication({ handlers: { onSetProduct } })
    )

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'HOST_COMMAND',
            source: 'some-other-source',
            payload: { command: 'setProduct', productId: 'p123' },
          },
        })
      )
    })

    expect(onSetProduct).not.toHaveBeenCalled()
  })

  it('rejects messages with wrong origin when allowedOrigin set', () => {
    const onSetProduct = vi.fn()
    renderHook(() =>
      useHostCommunication({
        allowedOrigin: 'https://trusted.com',
        handlers: { onSetProduct },
      })
    )

    act(() => {
      // jsdom messages have origin '' by default, which != 'https://trusted.com'
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'HOST_COMMAND',
            source: 'portable-inventory-host',
            payload: { command: 'setProduct', productId: 'p123' },
          },
          origin: 'https://evil.com',
        })
      )
    })

    expect(onSetProduct).not.toHaveBeenCalled()
  })

  it('sendTransactionEvent sends WIDGET_EVENT to host', () => {
    const { result } = renderHook(() =>
      useHostCommunication({ handlers: {} })
    )

    act(() => {
      result.current.sendTransactionEvent({
        transactionType: 'check_in',
        productId: 'p1',
        quantity: 5,
        success: true,
      })
    })

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WIDGET_EVENT',
        source: 'portable-inventory-widget',
        payload: expect.objectContaining({
          eventType: 'transaction_complete',
          transactionType: 'check_in',
          productId: 'p1',
          quantity: 5,
          success: true,
        }),
      }),
      '*'
    )
  })

  it('sendErrorEvent sends error WIDGET_EVENT to host', () => {
    const { result } = renderHook(() =>
      useHostCommunication({ handlers: {} })
    )

    act(() => {
      result.current.sendErrorEvent('something broke', 'ERR_500')
    })

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WIDGET_EVENT',
        source: 'portable-inventory-widget',
        payload: expect.objectContaining({
          eventType: 'error',
          message: 'something broke',
          code: 'ERR_500',
        }),
      }),
      '*'
    )
  })
})

describe('useWidgetResize', () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    postMessageSpy = vi.fn()
    Object.defineProperty(window, 'parent', {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends WIDGET_RESIZE with scrollHeight on mount', () => {
    renderHook(() => useWidgetResize([]))

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WIDGET_RESIZE',
        source: 'portable-inventory-widget',
        payload: expect.objectContaining({
          height: expect.any(Number),
        }),
      }),
      '*'
    )
  })
})
