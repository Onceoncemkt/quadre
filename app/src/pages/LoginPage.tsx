import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, me } from '../lib/api'
import { useAuth } from '../state/auth'
import type { MeMembership } from '../state/auth'

export function LoginPage() {
  const { setToken, setSessionData } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await login(formData)
      setToken(response.token)
      const meResponse = await me(response.token)
      setSessionData(meResponse.user, meResponse.memberships as MeMembership[])
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="q-auth-page">
      <section className="q-auth-card">
        <h1>Entrar a Quadre</h1>
        <p>Inicia sesión para abrir tu panel operativo.</p>
        <form onSubmit={handleSubmit}>
          <label className="q-field">
            Email
            <input
              type="email"
              required
              value={formData.email}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </label>
          <label className="q-field">
            Contraseña
            <input
              type="password"
              required
              value={formData.password}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </label>
          <button className="q-btn" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          {error ? (
            <p style={{ color: 'var(--falt)', marginTop: 10, fontSize: 14 }}>{error}</p>
          ) : null}
        </form>
        <p className="q-link-row">
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </section>
    </main>
  )
}
