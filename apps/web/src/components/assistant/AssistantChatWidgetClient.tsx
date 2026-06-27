'use client';

// Client Component wrapper for AssistantChatWidget.
// V572: المساعد متاح فقط في صفحات dashboard (ليس في صفحة الهبوط)
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AssistantChatWidget = dynamic(
  () => import('./AssistantChatWidget'),
  { ssr: false }
);

export default function AssistantChatWidgetClient() {
  const pathname = usePathname();

  // V572: اعرض المساعد فقط في صفحات /dashboard
  const isDashboard = pathname.includes('/dashboard');

  if (!isDashboard) return null;

  return <AssistantChatWidget />;
}
