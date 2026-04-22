'use client'

import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useToast } from '@/hooks/use-toast'

export function NotificationToaster() {
  const { notifications } = useNotificationStore()
  const { toast } = useToast()
  
  const lastToastedId = useRef<string | null>(null)
  
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0]
      
      if (latest.id !== lastToastedId.current) {
        toast({
          title: latest.title,
          description: latest.message,
          variant: latest.type === 'error' ? 'destructive' : 'default',
        })
        lastToastedId.current = latest.id
      }
    }
  }, [notifications, toast])

  return null // This component only manages side effects
}
