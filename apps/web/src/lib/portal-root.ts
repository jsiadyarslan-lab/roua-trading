/**
 * Portal Root Helper
 *
 * FIX: Replaces `document.body` as the portal target for createPortal().
 *
 * Problem: Using `document.body` as createPortal target causes
 * "Node cannot be found in the current page" errors when Next.js
 * client-side navigation replaces the body content. React loses the
 * reference to the DOM node that was portal'd into the old body.
 *
 * Solution: Use a dedicated `<div id="portal-root" />` element that's
 * rendered inside the dashboard layout (stable across navigations).
 * This div is a direct child of the layout's root div, so it survives
 * client-side route transitions.
 *
 * Usage:
 *   import { getPortalRoot } from '@/lib/portal-root'
 *   return createPortal(content, getPortalRoot())
 */

let _portalRoot: HTMLElement | null = null

export function getPortalRoot(): HTMLElement {
  if (_portalRoot && _portalRoot.isConnected) return _portalRoot

  // Try to find existing portal root
  const existing = document.getElementById('portal-root')
  if (existing) {
    _portalRoot = existing
    return existing
  }

  // Fallback: create one dynamically (shouldn't happen normally)
  const created = document.createElement('div')
  created.id = 'portal-root'
  document.body.appendChild(created)
  _portalRoot = created
  return created
}
