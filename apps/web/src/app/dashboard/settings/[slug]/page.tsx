import { redirect } from 'next/navigation'

/**
 * Catch-all redirect for stale settings sub-routes.
 *
 * WHY: The navigation previously linked to /dashboard/settings/notifications,
 * /dashboard/settings/profile, /dashboard/settings/payments, /dashboard/settings/linking
 * which don't have page.tsx files. When Next.js soft-navigates to a non-existent route,
 * it receives invalid RSC flight data (404 HTML instead of React stream), which crashes
 * the reconciler with "Node cannot be found in the current page".
 *
 * This catch-all redirects any unknown /dashboard/settings/* sub-route back to the
 * main settings page, which already has tabs for all these sections.
 */
export default function SettingsSubRouteRedirect({
  params,
}: {
  params: { slug: string }
}) {
  const knownRoutes = ['exchange']
  if (!knownRoutes.includes(params.slug)) {
    redirect('/dashboard/settings')
  }
  // For known routes that somehow fall through, also redirect
  redirect('/dashboard/settings')
}
