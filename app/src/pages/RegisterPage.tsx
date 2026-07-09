import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { me, register } from '../lib/api'
import { useAuth } from '../state/auth'
import type { MeMembership } from '../state/auth'

export function RegisterPage() {
  const { setToken, setSessionData } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
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
      const response = await register(formData)
      setToken(response.token)
      const meResponse = await me(response.token)
      setSessionData(meResponse.user, meResponse.memberships as MeMembership[])
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="q-auth-page">
      <section className="q-auth-card">
        <h1>Crear cuenta</h1>
        <p>Registra tu negocio y empieza tu prueba de Quadre.</p>
        <form onSubmit={handleSubmit}>
          <label className="q-field">
            Nombre
            <input
              type="text"
              required
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <label className="q-field">
            Nombre del negocio
            <input
              type="text"
              required
              value={formData.businessName}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, businessName: event.target.value }))
              }
            />
          </label>
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
              minLength={8}
              required
              value={formData.password}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </label>
          <button className="q-btn" type="submit" disabled={loading}>
            {loading ? 'Registrando...' : 'Registrarme'}
          </button>
          {error ? (
            <p style={{ color: 'var(--falt)', marginTop: 10, fontSize: 14 }}>{error}</p>
          ) : null}
        </form>
        <p className="q-link-row">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </section>
    </main>
  )
}
