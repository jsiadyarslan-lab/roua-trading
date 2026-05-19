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
 * rendered inside the layout (stable across navigations within the same
 * layout). This div is a direct child of the layout's root div, so it
 * survives client-side route transitions.
 *
 * Both dashboard and mobile layouts now include a `<div id="portal-root" />`.
 * This function always tries to find the live portal root first, and only
 * creates a fallback if none exists.
 *
 * Usage:
 *   import { getPortalRoot } from '@/lib/portal-root'
 *   return createPortal(content, getPortalRoot())
 */

let _portalRoot: HTMLElement | null = null

export function getPortalRoot(): HTMLElement {
  // Always try to find the current live portal root first.
  // This handles the case where the layout was re-rendered and the
  // old portal-root div was removed (e.g., navigating between
  // dashboard and mobile layouts).
  const existing = document.getElementById('portal-root')
  if (existing) {
    _portalRoot = existing
    return existing
  }

  // Check cached ref is still in the DOM
  if (_portalRoot && _portalRoot.isConnected) return _portalRoot

  // Fallback: create one dynamically (shouldn't happen normally since
  // both dashboard and mobile layouts include <div id="portal-root" />)
  const created = document.createElement('div')
  created.id = 'portal-root'
  document.body.appendChild(created)
  _portalRoot = created
  return created
}
