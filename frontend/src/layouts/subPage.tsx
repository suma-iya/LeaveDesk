import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// On mobile, sub-pages (details, forms, profile) replace the logo with a back
// button and a title, and hide the tab bar. Pages declare this with useSubPage.

export interface SubPage {
  title: string
  back: string
}

const SubPageContext = createContext<{ subPage: SubPage | null; set: (s: SubPage | null) => void } | null>(null)

export function SubPageProvider({ children }: { children: ReactNode }) {
  const [subPage, set] = useState<SubPage | null>(null)
  return <SubPageContext.Provider value={{ subPage, set }}>{children}</SubPageContext.Provider>
}

export function useSubPageState() {
  return useContext(SubPageContext)?.subPage ?? null
}

export function useSubPage(title: string, back: string) {
  const set = useContext(SubPageContext)?.set
  useEffect(() => {
    set?.({ title, back })
    return () => set?.(null)
  }, [set, title, back])
}
