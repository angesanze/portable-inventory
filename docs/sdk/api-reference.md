---
type: reference
title: SDK API Reference
created: 2026-04-22
tags:
  - sdk
  - api
  - reference
  - typescript
related:
  - '[[getting-started]]'
  - '[[web-component]]'
  - '[[security]]'
---

# API Reference

## `PortableInventory` Class

The main SDK class. Manages an iframe-based widget with typed event communication.

### Constructor

```ts
new PortableInventory(config: PortableInventoryConfig)
```

Throws if `apiKey` or `container` is missing.

### `PortableInventoryConfig`

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `apiKey` | `string` | Yes | — | API key for authenticating with the widget backend |
| `baseUrl` | `string` | No | `window.location.origin` | Base URL of the Varasto instance |
| `container` | `string \| HTMLElement` | Yes | — | CSS selector or DOM element to mount the widget into |
| `theme` | `ThemeConfig` | No | `DEFAULT_THEME` | Visual theme configuration |
| `locale` | `string` | No | — | Locale code (e.g. `en`, `fr`) passed to the widget |

---

### Static methods

#### `PortableInventory.exchangeToken(token: string, baseUrl?: string): Promise<string>`

Exchanges a short-lived QR token for the company API key. QR redirects
(`/go/<code>/`) emit a signed, expiring `?token=...` instead of embedding the
long-lived key in the URL. Call this once to resolve the key, then construct the
widget with it. Tokens expire after ~10 minutes; on expiry the promise rejects
and the user must re-scan.

```ts
const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const apiKey = token
  ? await PortableInventory.exchangeToken(token)
  : params.get("api_key"); // legacy fallback (deprecated)

const widget = new PortableInventory({ apiKey, container: "#widget" });
widget.mount();
```

> Embedding `api_key` directly in a QR URL is **deprecated** — use the token
> flow. See the [Widget API authentication section](../api/widget-api.md).

### Methods

#### `mount(): void`

Creates an iframe targeting the widget route and inserts it into the container. Sets up the postMessage listener for cross-origin communication. Idempotent — calling `mount()` on an already-mounted widget is a no-op.

Throws if the container selector does not match any DOM element.

```ts
widget.mount();
```

#### `unmount(): void`

Removes the iframe from the DOM and cleans up the message listener. Safe to call when not mounted. The instance remains reusable — you can call `mount()` again after unmounting.

```ts
widget.unmount();
```

#### `destroy(): void`

Calls `unmount()`, then clears all registered event listeners and nullifies the container reference. The instance is no longer usable after `destroy()`.

```ts
widget.destroy();
```

#### `on<T extends WidgetEventType>(event: T, callback: (data: WidgetEventMap[T]) => void): void`

Registers a typed event listener. Multiple listeners can be registered for the same event.

```ts
widget.on('ready', (data) => {
  // data is typed as { version: string; capabilities: string[] }
  console.log(data.version);
});
```

#### `off<T extends WidgetEventType>(event: T, callback: (data: WidgetEventMap[T]) => void): void`

Removes a previously registered event listener. Pass the same function reference used in `on()`. Safe to call if the listener was never registered.

```ts
const handler = (data) => console.log(data);
widget.on('transaction_complete', handler);
widget.off('transaction_complete', handler);
```

#### `setProduct(productId: string | number): void`

Sends a `HOST_COMMAND` message to the widget to navigate to the specified product. Does not throw if the iframe is not yet mounted.

```ts
widget.setProduct(42);
```

#### `setLocation(locationId: string | number): void`

Sends a `HOST_COMMAND` message to the widget to set the active location context. Does not throw if the iframe is not yet mounted.

```ts
widget.setLocation(7);
```

---

## `ThemeConfig`

Controls the visual appearance of the embedded widget. All properties are optional — omitted values fall back to `DEFAULT_THEME`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `primaryColor` | `string` | `'#3b82f6'` | Primary accent color (buttons, links, highlights) |
| `backgroundColor` | `string` | `'#ffffff'` | Widget background color |
| `textColor` | `string` | `'#1f2937'` | Primary text color |
| `borderRadius` | `string` | `'8px'` | Border radius for cards and inputs |
| `fontFamily` | `string` | `'system-ui, -apple-system, sans-serif'` | Font stack |
| `compact` | `boolean` | `false` | Reduces padding and font sizes for tighter layouts |

Themes are serialized as base64-encoded JSON and passed to the widget iframe via query parameter. Inside the widget, values are applied as CSS custom properties:

| CSS Variable | Maps to |
|-------------|---------|
| `--pi-primary` | `primaryColor` |
| `--pi-bg` | `backgroundColor` |
| `--pi-text` | `textColor` |
| `--pi-radius` | `borderRadius` |
| `--pi-font` | `fontFamily` |

### Theme Utility Functions

```ts
import { serializeTheme, deserializeTheme, DEFAULT_THEME } from '@portable-inventory/widget-sdk';
```

#### `serializeTheme(theme: ThemeConfig): string`

Merges the provided theme with `DEFAULT_THEME` and returns a base64-encoded JSON string suitable for URL parameters.

#### `deserializeTheme(encoded: string): ThemeConfig`

Decodes a base64 theme string back to a `ThemeConfig` object. Returns `DEFAULT_THEME` on parse failure.

#### `DEFAULT_THEME`

```ts
{
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  borderRadius: '8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  compact: false,
}
```

---

## Events

### `WidgetEventType`

```ts
type WidgetEventType = 'ready' | 'resize' | 'transaction_complete' | 'error'
```

### `WidgetEventMap`

| Event | Payload | When |
|-------|---------|------|
| `ready` | `{ version: string; capabilities: string[] }` | Widget iframe loaded and initialized |
| `resize` | `{ height: number }` | Widget content height changed (iframe auto-resizes) |
| `transaction_complete` | `{ transactionType: string; productId: string \| number; quantity: number; success: boolean }` | Inventory operation completed |
| `error` | `{ message: string; code?: string }` | An error occurred inside the widget |

### Example: Full Event Handling

```ts
const widget = new PortableInventory({
  apiKey: 'your-api-key',
  container: '#widget',
});

widget.on('ready', ({ version, capabilities }) => {
  console.log(`Widget v${version} ready. Capabilities:`, capabilities);
});

widget.on('resize', ({ height }) => {
  console.log(`Widget resized to ${height}px`);
});

widget.on('transaction_complete', ({ transactionType, productId, quantity, success }) => {
  if (success) {
    showToast(`${transactionType}: ${quantity}x product #${productId}`);
  }
});

widget.on('error', ({ message, code }) => {
  console.error(`Widget error [${code}]: ${message}`);
});

widget.mount();
```

---

## PostMessage Protocol

The SDK communicates with the widget iframe using `window.postMessage`. All messages follow this envelope:

```ts
interface PostMessagePayload {
  type: 'WIDGET_READY' | 'WIDGET_RESIZE' | 'WIDGET_EVENT' | 'HOST_COMMAND'
  source: 'portable-inventory-widget' | 'portable-inventory-host'
  payload: Record<string, unknown>
}
```

| Type | Direction | Description |
|------|-----------|-------------|
| `WIDGET_READY` | Widget -> Host | Emitted on widget load with version and capabilities |
| `WIDGET_RESIZE` | Widget -> Host | Reports content height for iframe auto-sizing |
| `WIDGET_EVENT` | Widget -> Host | Carries typed events (transaction_complete, error) |
| `HOST_COMMAND` | Host -> Widget | Sends commands (setProduct, setLocation, setTheme) |

See [[security]] for origin validation details.

---

## TypeScript Exports

All public types are exported from the package entry point:

```ts
import {
  PortableInventory,
  PortableInventoryElement,   // Web Component class
  serializeTheme,
  deserializeTheme,
  DEFAULT_THEME,
} from '@portable-inventory/widget-sdk';

import type {
  PortableInventoryConfig,
  ThemeConfig,
  WidgetEvent,
  WidgetEventMap,
  PostMessagePayload,
} from '@portable-inventory/widget-sdk';
```
