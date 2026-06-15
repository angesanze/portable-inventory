---
type: reference
title: Web Component Reference
created: 2026-04-22
tags:
  - sdk
  - web-component
  - custom-element
  - integration
related:
  - '[[getting-started]]'
  - '[[api-reference]]'
  - '[[security]]'
---

# `<portable-inventory>` Web Component

A custom element that wraps the `PortableInventory` SDK class. Uses Shadow DOM for style encapsulation. No JavaScript setup required — just set attributes.

## Basic Usage

```html
<script src="https://unpkg.com/@portable-inventory/widget-sdk@0.1.0/dist/portable-inventory-sdk.umd.js"></script>

<portable-inventory
  api-key="your-api-key"
  base-url="https://your-instance.example.com"
></portable-inventory>
```

The element auto-mounts when connected to the DOM and auto-destroys when removed.

## Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `api-key` | string | Yes | API key for authentication. Element does not mount without this. |
| `base-url` | string | No | Base URL of the Varasto instance |
| `product-id` | string | No | Navigate widget to this product on mount |
| `location-id` | string | No | Set active location context on mount |
| `theme-primary` | string | No | Primary accent color (e.g. `#3b82f6`) |
| `theme-bg` | string | No | Background color |
| `theme-text` | string | No | Text color |
| `theme-radius` | string | No | Border radius (e.g. `8px`) |
| `theme-font` | string | No | Font family |
| `compact` | boolean | No | Presence attribute — add to enable compact mode (no value needed) |

All 10 attributes are observed. Changing any attribute dynamically triggers a widget reconnect.

## Themed Example

```html
<portable-inventory
  api-key="your-api-key"
  base-url="https://your-instance.example.com"
  product-id="42"
  theme-primary="#10b981"
  theme-bg="#f0fdf4"
  theme-text="#065f46"
  theme-radius="12px"
  compact
></portable-inventory>
```

## Dynamic Attribute Updates

Changing `product-id` or `location-id` sends a command to the widget without full reconnect. Changing config or theme attributes triggers a destroy-and-remount cycle.

```js
const el = document.querySelector('portable-inventory');

// Navigates widget to product 99 (no reconnect)
el.setAttribute('product-id', '99');

// Changes theme — triggers full reconnect
el.setAttribute('theme-primary', '#ef4444');
```

## Framework Integration

### React

```tsx
function InventoryWidget({ apiKey, productId }: { apiKey: string; productId: string }) {
  return (
    <portable-inventory
      api-key={apiKey}
      base-url="https://your-instance.example.com"
      product-id={productId}
      theme-primary="#3b82f6"
    />
  );
}
```

For TypeScript, add a type declaration to avoid JSX errors:

```ts
// src/types/web-components.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'portable-inventory': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        'api-key'?: string;
        'base-url'?: string;
        'product-id'?: string;
        'location-id'?: string;
        'theme-primary'?: string;
        'theme-bg'?: string;
        'theme-text'?: string;
        'theme-radius'?: string;
        'theme-font'?: string;
        compact?: boolean;
      },
      HTMLElement
    >;
  }
}
```

### Vue

```vue
<template>
  <portable-inventory
    :api-key="apiKey"
    base-url="https://your-instance.example.com"
    :product-id="selectedProduct"
    theme-primary="#8b5cf6"
  />
</template>

<script setup lang="ts">
import '@portable-inventory/widget-sdk';
import { ref } from 'vue';

const apiKey = 'your-api-key';
const selectedProduct = ref('42');
</script>
```

Tell Vue to skip resolution of the custom element:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'portable-inventory',
        },
      },
    }),
  ],
});
```

### Angular

Register the `CUSTOM_ELEMENTS_SCHEMA` in your module:

```ts
// app.module.ts
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import '@portable-inventory/widget-sdk';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // ...
})
export class AppModule {}
```

Use in templates:

```html
<portable-inventory
  [attr.api-key]="apiKey"
  base-url="https://your-instance.example.com"
  [attr.product-id]="selectedProduct"
  theme-primary="#f59e0b"
></portable-inventory>
```

## Shadow DOM

The web component uses Shadow DOM (`mode: 'open'`) to encapsulate the widget iframe. Parent page styles do not leak into the widget, and widget styles do not affect the host page.

To inspect the shadow root programmatically:

```js
const el = document.querySelector('portable-inventory');
console.log(el.shadowRoot); // ShadowRoot { mode: 'open', ... }
```

## Listening to Events

The web component does not directly expose the `on()`/`off()` event API. To listen to widget events, use the JavaScript API instead:

```js
import { PortableInventory } from '@portable-inventory/widget-sdk';

const widget = new PortableInventory({
  apiKey: 'your-api-key',
  container: '#my-container',
});

widget.on('transaction_complete', (data) => {
  console.log(data);
});

widget.mount();
```

See [[api-reference]] for the full event system documentation.
