import { create } from 'zustand'

export interface AppNotification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error' | 'trade' | 'ai'
  timestamp: string
  read: boolean
  link?: string
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  addNotification: (note: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (note) => {
    const newNote: AppNotification = {
      ...note,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      read: false,
    }
    set((state) => ({
      notifications: [newNote, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }))
    
    // Optional: Trigger browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(newNote.title, { body: newNote.message })
    }
  },

  markAsRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    unreadCount: Math.max(0, state.unreadCount - 1),
  })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
