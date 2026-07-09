import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../state/auth'

const navGroups = [
  {
    title: 'Operación',
    items: ['Dashboard', 'Cierres de turno', 'Requisiciones'],
  },
  {
    title: 'Dinero',
    items: ['Proveedores y adeudos', 'Nómina', 'Gastos', 'P&L y reportes'],
  },
]

export function AppShellPage() {
  const { logout, memberships, loadingUser, refreshMe, user } = useAuth()
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [activeItem, setActiveItem] = useState('Dashboard')

  useEffect(() => {
    if (!memberships.length) {
      refreshMe().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!selectedBusinessId && memberships.length) {
      setSelectedBusinessId(memberships[0].business.id)
    }
  }, [memberships, selectedBusinessId])

  const selectedBusiness = useMemo(
    () => memberships.find((m) => m.business.id === selectedBusinessId)?.business,
    [memberships, selectedBusinessId],
  )

  useEffect(() => {
    if (selectedBusiness?.locations?.length) {
      setSelectedLocationId((prev) => prev || selectedBusiness.locations[0].id)
    } else {
      setSelectedLocationId('')
    }
  }, [selectedBusiness])

  return (
    <>
      <header className="q-topbar">
        <img src="/logo.png" alt="Quadre" />
        <button className="q-btn" type="button" onClick={logout} style={{ width: 'auto' }}>
          Salir
        </button>
      </header>

      <main className="q-app-shell">
        <aside className="q-sidebar">
          <div className="q-sidebar-logo">
            <img src="/logo.png" alt="Quadre" />
          </div>

          <div className="q-selector-block">
            <label>
              Negocio
              <select
                value={selectedBusinessId}
                onChange={(event) => setSelectedBusinessId(event.target.value)}
              >
                {memberships.map((membership) => (
                  <option key={membership.business.id} value={membership.business.id}>
                    {membership.business.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sucursal
              <select
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
              >
                {(selectedBusiness?.locations || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {navGroups.map((group) => (
            <section className="q-nav-group" key={group.title}>
              <h4>{group.title}</h4>
              <ul className="q-nav-list">
                {group.items.map((item) => (
                  <li key={item}>
                    <button
                      className={`q-nav-item ${activeItem === item ? 'active' : ''}`}
                      type="button"
                      onClick={() => setActiveItem(item)}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <section className="q-main">
          {loadingUser ? <p>Cargando sesión...</p> : null}
          {!loadingUser && activeItem === 'Dashboard' ? (
            <section className="q-dashboard">
              <h1>Hola, {user?.name || 'equipo'}.</h1>
              <p>
                Este dashboard queda listo para conectar cierres, gastos y P&L en el siguiente sprint.
              </p>
              <div className="q-cards">
                <article className="q-card">
                  <h3>Ventas netas hoy</h3>
                  <div className="value q-mono">$0.00</div>
                </article>
                <article className="q-card">
                  <h3>Faltantes del día</h3>
                  <div className="value q-mono">$0.00</div>
                </article>
                <article className="q-card">
                  <h3>Gasto operativo</h3>
                  <div className="value q-mono">$0.00</div>
                </article>
                <article className="q-card">
                  <h3>Utilidad estimada</h3>
                  <div className="value q-mono">$0.00</div>
                </article>
              </div>
            </section>
          ) : null}

          {!loadingUser && activeItem !== 'Dashboard' ? (
            <p>
              Módulo <strong>{activeItem}</strong> visible en el shell. Se implementa funcionalidad en los
              siguientes bloques.
            </p>
          ) : null}
        </section>
      </main>
    </>
  )
}
