import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { me } from '../lib/api'

export type MeUser = {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
}

export type MeMembership = {
  id: string
  role: string
  businessId: string
  locationId: string | null
  business: {
    id: string
    name: string
    slug: string
    locations: Array<{ id: string; name: string }>
  }
}

type AuthContextValue = {
  token: string | null
  isAuthenticated: boolean
  user: MeUser | null
  memberships: MeMembership[]
  loadingUser: boolean
  setToken: (token: string | null) => void
  setSessionData: (user: MeUser, memberships: MeMembership[]) => void
  refreshMe: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const TOKEN_STORAGE_KEY = 'quadre_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  })
  const [user, setUser] = useState<MeUser | null>(null)
  const [memberships, setMemberships] = useState<MeMembership[]>([])
  const [loadingUser, setLoadingUser] = useState(false)

  function setToken(nextToken: string | null) {
    setTokenState(nextToken)
    if (nextToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setUser(null)
      setMemberships([])
    }
  }

  function setSessionData(nextUser: MeUser, nextMemberships: MeMembership[]) {
    setUser(nextUser)
    setMemberships(nextMemberships)
  }

  async function refreshMe() {
    if (!token) return
    setLoadingUser(true)
    try {
      const response = await me(token)
      setSessionData(response.user, response.memberships as MeMembership[])
    } finally {
      setLoadingUser(false)
    }
  }
  function logout() {
    setToken(null)
  }

  useEffect(() => {
    if (token && !user) {
      refreshMe().catch(() => {
        setToken(null)
      })
    }
  }, [token, user])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      user,
      memberships,
      loadingUser,
      setToken,
      setSessionData,
      refreshMe,
      logout,
    }),
    [loadingUser, memberships, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
