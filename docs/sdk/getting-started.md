---
type: reference
title: Getting Started with the Varasto Widget SDK
created: 2026-04-22
tags:
  - sdk
  - widget
  - integration
  - quickstart
related:
  - '[[api-reference]]'
  - '[[web-component]]'
  - '[[security]]'
---

# Getting Started

The `@portable-inventory/widget-sdk` lets you embed a fully interactive inventory widget into any website. It handles iframe management, cross-origin communication, theming, and event routing so you can focus on your integration logic.

## Installation

### npm / yarn / pnpm

```bash
npm install @portable-inventory/widget-sdk
```

```bash
yarn add @portable-inventory/widget-sdk
```

```bash
pnpm add @portable-inventory/widget-sdk
```

### CDN Script Tag

```html
<script src="https://unpkg.com/@portable-inventory/widget-sdk@0.1.0/dist/portable-inventory-sdk.umd.js"></script>
```

When loaded via script tag, the SDK is available as `window.PortableInventorySDK`.

## Quick Start — JavaScript API

```html
<div id="inventory-widget"></div>

<script type="module">
  import { PortableInventory } from '@portable-inventory/widget-sdk';

  const widget = new PortableInventory({
    apiKey: 'your-api-key',
    baseUrl: 'https://your-instance.example.com',
    container: '#inventory-widget',
  });

  widget.on('ready', (data) => {
    console.log('Widget ready, version:', data.version);
  });

  widget.mount();
</script>
```

## Quick Start — Web Component

No JavaScript required. Drop the element into your HTML:

```html
<script src="https://unpkg.com/@portable-inventory/widget-sdk@0.1.0/dist/portable-inventory-sdk.umd.js"></script>

<portable-inventory
  api-key="your-api-key"
  base-url="https://your-instance.example.com"
  product-id="42"
></portable-inventory>
```

See [Web Component](web-component.md) for full attribute reference and framework examples.

## Quick Start — UMD (Script Tag + JS API)

```html
<div id="inventory-widget"></div>

<script src="https://unpkg.com/@portable-inventory/widget-sdk@0.1.0/dist/portable-inventory-sdk.umd.js"></script>
<script>
  var widget = new PortableInventorySDK.PortableInventory({
    apiKey: 'your-api-key',
    baseUrl: 'https://your-instance.example.com',
    container: '#inventory-widget',
  });

  widget.mount();
</script>
```

## Adding a Theme

Pass a `theme` object to customize the widget appearance:

```js
const widget = new PortableInventory({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-instance.example.com',
  container: '#inventory-widget',
  theme: {
    primaryColor: '#10b981',
    backgroundColor: '#f0fdf4',
    borderRadius: '12px',
    compact: true,
  },
});

widget.mount();
```

See [API Reference](api-reference.md) for all `ThemeConfig` options.

## Listening to Events

```js
widget.on('transaction_complete', (data) => {
  console.log(`Product ${data.productId}: moved ${data.quantity} units`);
  console.log('Success:', data.success);
});

widget.on('error', (data) => {
  console.error('Widget error:', data.message, data.code);
});
```

## Programmatic Control

Navigate the widget to a specific product or location after mount:

```js
widget.setProduct(42);
widget.setLocation(7);
```

## Cleanup

```js
// Remove iframe, keep instance reusable
widget.unmount();

// Full teardown — clears all listeners and internal state
widget.destroy();
```

## Next Steps

- [API Reference](api-reference.md) — Full class API, config options, event types
- [Web Component](web-component.md) — `<portable-inventory>` element reference and framework snippets
- [Security](security.md) — CSP headers, domain whitelisting, origin validation
