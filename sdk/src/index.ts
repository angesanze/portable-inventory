export { PortableInventory } from './PortableInventory'
export { serializeTheme, deserializeTheme, DEFAULT_THEME } from './theme'
export { PortableInventoryElement } from './WebComponent'
export type {
  PortableInventoryConfig,
  ThemeConfig,
  WidgetEvent,
  WidgetEventMap,
  PostMessagePayload,
} from './types'

import { PortableInventoryElement } from './WebComponent'

if (typeof customElements !== 'undefined' && !customElements.get('portable-inventory')) {
  customElements.define('portable-inventory', PortableInventoryElement)
}
