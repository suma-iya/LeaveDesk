import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '@/api'
import { setAppTimeZone } from '@/lib/format'

const AuthContext = createContext(null)

// Holds the logged-in user for the whole app. The JWT itself lives in
// localStorage (see tokenStore in api.js) so a page refresh keeps you in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [config, setConfig] = useState({ google_client_id: '', demo_mode: false })
  const [checking, setChecking] = useState(true)

  const logout = useCallback(() => {
    api.tokenStore.clear()
    setUser(null)
  }, [])

  // On first load: fetch public config and, if a token is stored, ask the
  // server who it belongs to. An expired token makes /auth/me return 401.
  useEffect(() => {
    api.setUnauthorizedHandler(logout)

    const loadConfig = api.getAuthConfig()
      .then((cfg) => { setAppTimeZone(cfg.timezone); setConfig(cfg) })
      .catch(() => {})
    // Only a 401 means the token is bad. Other failures (e.g. the backend is
    // restarting) keep the token so a refresh can succeed later.
    const restoreSession = api.tokenStore.get()
      ? api.getCurrentUser().then(setUser).catch((err) => { if (err.status === 401) logout() })
      : Promise.resolve()

    Promise.all([loadConfig, restoreSession]).finally(() => setChecking(false))
  }, [logout])

  const startSession = useCallback((session) => {
    api.tokenStore.set(session.token)
    setUser(session.user)
    return session.user
  }, [])

  const value = useMemo(() => ({
    user,
    checking,
    googleClientId: config.google_client_id,
    demoMode: config.demo_mode,
    isManager: user?.role === 'MANAGER',
    login: (email, password) => api.login(email, password).then(startSession),
    loginWithGoogle: (credential) => api.loginWithGoogle(credential).then(startSession),
    logout,
  }), [user, checking, config, startSession, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
