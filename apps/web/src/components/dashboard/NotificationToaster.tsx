'use client'

import { useEffect } from 'react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useToast } from '@/hooks/use-toast'

export function NotificationToaster() {
  const { notifications } = useNotificationStore()
  const { toast } = useToast()
  
  useEffect(() => {
    // Listen for new notifications
    if (notifications.length > 0) {
      const latest = notifications[0]
      // Check if it's "new" (less than 5 seconds old) to avoid re-toasting old ones on mount
      const age = Date.now() - new Date(latest.timestamp).getTime()
      
      if (age < 5000) {
        toast({
          title: latest.title,
          description: latest.message,
          variant: latest.type === 'error' ? 'destructive' : 'default',
        })
      }
    }
  }, [notifications, toast])

  return null // This component only manages side effects
}
