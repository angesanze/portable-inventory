---
type: reference
title: SDK Security Guide
created: 2026-04-22
tags:
  - sdk
  - security
  - csp
  - cors
  - origin-validation
related:
  - '[[api-reference]]'
  - '[[getting-started]]'
  - '[[web-component]]'
---

# Security

This guide covers the security model of the Varasto Widget SDK: how cross-origin communication is validated, what CSP headers you need, API key scoping, and domain whitelisting.

## Origin Validation

All postMessage communication between the host page and the widget iframe is origin-validated.

### Incoming Messages (Widget -> Host)

The SDK only processes messages where `event.origin` matches the expected origin derived from `baseUrl`:

```
expected = new URL(baseUrl).origin
```

Messages from any other origin are silently dropped. Additionally, messages must carry `source: 'portable-inventory-widget'` — messages without this source identifier are also rejected.

### Outgoing Messages (Host -> Widget)

When the SDK sends commands (`setProduct`, `setLocation`), it targets the exact origin:

```ts
iframe.contentWindow.postMessage(message, new URL(baseUrl).origin);
```

This prevents the message from being delivered to an unexpected origin if the iframe is somehow navigated away.

### What This Prevents

- **Cross-origin eavesdropping:** A malicious page cannot intercept widget events.
- **Command injection:** Only the configured origin can send commands to the widget.
- **Spoofed events:** The SDK ignores messages that do not match both the expected origin and source identifier.

## Content Security Policy (CSP)

If your site uses CSP headers, you need to allow the widget iframe source and the SDK script.

### Required Directives

```
frame-src https://your-instance.example.com;
script-src https://unpkg.com;  # only if loading SDK from CDN
```

If self-hosting the SDK bundle, replace the `script-src` entry with `'self'` or your asset domain.

### Recommended Full Policy

```
Content-Security-Policy:
  default-src 'self';
  frame-src https://your-instance.example.com;
  script-src 'self' https://unpkg.com;
  style-src 'self' 'unsafe-inline';
  connect-src 'self';
```

The `style-src 'unsafe-inline'` is needed if the widget injects CSS custom properties for theming. If your CSP is strict about inline styles, the theme system still works because the CSS custom properties are set via JavaScript on the container element, not via inline `<style>` tags.

### No `child-src` Required

The SDK does not spawn web workers or shared workers. Only `frame-src` is needed.

## API Key Scoping

API keys control what data and actions the widget can access. Best practices:

### Principle of Least Privilege

- Create a **dedicated API key** for widget use — do not reuse admin or backend keys.
- Scope the key to only the endpoints the widget needs (product lookup, stock queries, inventory moves).
- Set the key to **read-only** if the widget is display-only (no transactions).

### Key Exposure

The API key is visible in the iframe URL (`?api_key=...`). This is by design — widget API keys are **public-facing** tokens, similar to Google Maps API keys. They identify the integration, not authenticate a user.

To protect against abuse:

1. **Rate limit** API key usage on the backend.
2. **Restrict by domain** — configure allowed domains for each API key so it only works when embedded on authorized sites.
3. **Rotate keys** periodically and when a key may be compromised.

### Do Not Use

- Admin API keys in the widget
- Keys with write access beyond what the widget needs
- A single shared key across multiple third-party integrations

## Domain Whitelisting

Configure allowed domains per API key on the backend. The widget backend should validate the `Origin` or `Referer` header on incoming requests against the whitelist for the given API key.

### Backend Configuration

```
API Key: pk_live_abc123
Allowed Domains:
  - https://shop.example.com
  - https://staging.shop.example.com
```

Requests from unlisted origins should receive `403 Forbidden`.

### SDK-Side Configuration

Set `baseUrl` to your Varasto instance:

```ts
const widget = new PortableInventory({
  apiKey: 'pk_live_abc123',
  baseUrl: 'https://inventory.example.com',
  container: '#widget',
});
```

The SDK derives the trusted origin from `baseUrl` and rejects postMessages from any other origin. If `baseUrl` is omitted, it defaults to `window.location.origin` — suitable only when the widget is hosted on the same domain.

## Iframe Sandboxing

The SDK does not add a `sandbox` attribute to the iframe by default, because the widget needs to execute scripts and submit forms. If your security posture requires sandboxing, you can constrain the iframe after mount:

```ts
widget.mount();

const iframe = document.querySelector('#widget-container iframe');
if (iframe) {
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
}
```

**Minimum required sandbox permissions:**

| Permission | Why |
|-----------|-----|
| `allow-scripts` | Widget JavaScript must execute |
| `allow-same-origin` | Required for cookie-based auth and API calls |
| `allow-forms` | Required if widget has form submissions |

## Checklist

Before deploying a widget integration to production:

- [ ] Dedicated API key created with minimal permissions
- [ ] Allowed domains configured for the API key on the backend
- [ ] `baseUrl` set explicitly (not relying on `window.location.origin`)
- [ ] CSP headers updated to allow iframe source
- [ ] API key rate limiting enabled on the backend
- [ ] Tested in a staging environment before production deploy
