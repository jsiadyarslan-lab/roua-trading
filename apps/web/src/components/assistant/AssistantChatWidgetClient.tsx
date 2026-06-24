'use client';

// Client Component wrapper for AssistantChatWidget.
// Required because layout.tsx is a Server Component and cannot use `ssr: false` with next/dynamic,
// but AssistantChatWidget uses localStorage and window APIs that require client-only rendering.
import dynamic from 'next/dynamic';

const AssistantChatWidget = dynamic(
  () => import('./AssistantChatWidget'),
  { ssr: false }
);

export default function AssistantChatWidgetClient() {
  return <AssistantChatWidget />;
}
