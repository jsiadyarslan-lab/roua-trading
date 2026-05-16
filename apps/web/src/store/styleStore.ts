import { create } from 'zustand'

interface StyleStore {
  styles: Record<string, string>
  addStyle: (id: string, css: string) => void
  removeStyle: (id: string) => void
}

export const useStyleStore = create<StyleStore>((set) => ({
  styles: {},
  addStyle: (id, css) => set((state) => ({ styles: { ...state.styles, [id]: css } })),
  removeStyle: (id) => set((state) => {
    const newStyles = { ...state.styles }
    delete newStyles[id]
    return { styles: newStyles }
  })
}))
