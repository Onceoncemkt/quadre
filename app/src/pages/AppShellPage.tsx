import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createShiftClosing, getShiftClosings, type ShiftClosingItem } from '../lib/api'
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

const shiftTypeOptions = ['MATUTINO', 'VESPERTINO', 'NOCTURNO', 'UNICO'] as const
const lineChannels = ['PISO', 'RAPPI', 'UBER_EATS', 'DIDI_FOOD', 'EVENTO', 'OTRO'] as const
const lineMethods = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'APP', 'OTRO'] as const
const defaultFeeByChannel: Record<(typeof lineChannels)[number], number> = {
  PISO: 0,
  EVENTO: 0,
  OTRO: 0,
  RAPPI: 34.8,
  UBER_EATS: 34.8,
  DIDI_FOOD: 34.8,
}

type ShiftLineDraft = {
  channel: (typeof lineChannels)[number]
  method: (typeof lineMethods)[number]
  gross: number
  feePct: number
}

type ClosingDraft = {
  date: string
  type: (typeof shiftTypeOptions)[number]
  openingCash: number
  cashWithdrawn: number
  countedCash: number
  notes: string
  lines: ShiftLineDraft[]
}

const defaultShiftLine: ShiftLineDraft = {
  channel: 'PISO',
  method: 'EFECTIVO',
  gross: 0,
  feePct: defaultFeeByChannel.PISO,
}

function getTodayDateInput() {
  const now = new Date()
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

function getStartOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diff)
  result.setHours(0, 0, 0, 0)
  return result
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatShiftType(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase()
}
function formatShiftDate(dateValue: string) {
  const dateOnly = dateValue.slice(0, 10)
  const [year, month, day] = dateOnly.split('-')
  if (!year || !month || !day) return dateValue
  return `${day}/${month}/${year}`
}

function getTotals(draft: ClosingDraft) {
  const efectivoVentas = draft.lines
    .filter((line) => line.method === 'EFECTIVO')
    .reduce((sum, line) => sum + line.gross, 0)

  const expectedCash = draft.openingCash + efectivoVentas - draft.cashWithdrawn
  const difference = draft.countedCash - expectedCash
  return { expectedCash, difference }
}

export function AppShellPage() {
  const { logout, memberships, loadingUser, refreshMe, user, token } = useAuth()
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [activeItem, setActiveItem] = useState('Dashboard')

  const [closings, setClosings] = useState<ShiftClosingItem[]>([])
  const [loadingClosings, setLoadingClosings] = useState(false)
  const [closingsError, setClosingsError] = useState('')
  const [closingsRange, setClosingsRange] = useState<'week' | 'month'>('week')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [savingClose, setSavingClose] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [closeDraft, setCloseDraft] = useState<ClosingDraft>({
    date: getTodayDateInput(),
    type: 'UNICO',
    openingCash: 1500,
    cashWithdrawn: 0,
    countedCash: 0,
    notes: '',
    lines: [{ ...defaultShiftLine }],
  })

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

  useEffect(() => {
    if (activeItem !== 'Cierres de turno' || !selectedLocationId || !token) return

    const now = new Date()
    const fromDate = closingsRange === 'week' ? getStartOfWeek(now) : getStartOfMonth(now)

    setLoadingClosings(true)
    setClosingsError('')
    getShiftClosings({
      token,
      locationId: selectedLocationId,
      from: toDateInput(fromDate),
      to: toDateInput(now),
    })
      .then((response) => setClosings(response.items))
      .catch((error) => {
        setClosings([])
        setClosingsError(error instanceof Error ? error.message : 'No se pudieron cargar los cierres')
      })
      .finally(() => setLoadingClosings(false))
  }, [activeItem, closingsRange, selectedLocationId, token])

  const selectedLocationName = useMemo(() => {
    return selectedBusiness?.locations.find((location) => location.id === selectedLocationId)?.name || ''
  }, [selectedBusiness, selectedLocationId])

  const closingTotals = useMemo(() => getTotals(closeDraft), [closeDraft])

  async function refreshShiftClosings() {
    if (!selectedLocationId || !token) return
    const now = new Date()
    const fromDate = closingsRange === 'week' ? getStartOfWeek(now) : getStartOfMonth(now)
    const response = await getShiftClosings({
      token,
      locationId: selectedLocationId,
      from: toDateInput(fromDate),
      to: toDateInput(now),
    })
    setClosings(response.items)
  }

  function updateShiftLine(index: number, next: Partial<ShiftLineDraft>) {
    setCloseDraft((prev) => {
      const lines = [...prev.lines]
      const current = lines[index]
      if (!current) return prev
      lines[index] = { ...current, ...next }
      return { ...prev, lines }
    })
  }

  function addShiftLine() {
    setCloseDraft((prev) => ({ ...prev, lines: [...prev.lines, { ...defaultShiftLine }] }))
  }

  function removeShiftLine(index: number) {
    setCloseDraft((prev) => {
      if (prev.lines.length <= 1) return prev
      return { ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }
    })
  }

  function resetCloseForm() {
    setCloseDraft({
      date: getTodayDateInput(),
      type: 'UNICO',
      openingCash: 1500,
      cashWithdrawn: 0,
      countedCash: 0,
      notes: '',
      lines: [{ ...defaultShiftLine }],
    })
    setCloseError('')
  }

  async function handleCreateClosing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedLocationId || !token) return

    setSavingClose(true)
    setCloseError('')
    try {
      await createShiftClosing({
        token,
        locationId: selectedLocationId,
        payload: {
          date: closeDraft.date,
          type: closeDraft.type,
          openingCash: closeDraft.openingCash,
          cashWithdrawn: closeDraft.cashWithdrawn,
          countedCash: closeDraft.countedCash,
          notes: closeDraft.notes || undefined,
          lines: closeDraft.lines.map((line) => ({
            channel: line.channel,
            method: line.method,
            gross: line.gross,
            feePct: line.feePct,
          })),
        },
      })
      await refreshShiftClosings()
      resetCloseForm()
      setShowCloseForm(false)
      setActiveItem('Cierres de turno')
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : 'No se pudo cerrar el turno')
    } finally {
      setSavingClose(false)
    }
  }

  const renderShiftClosings = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Cierres de turno</h1>
          <p>Control de arqueo por turno para la sucursal seleccionada.</p>
        </div>
        <div className="q-actions-row">
          <div className="q-filter-row">
            <button
              type="button"
              className={`q-chip-btn ${closingsRange === 'week' ? 'active' : ''}`}
              onClick={() => setClosingsRange('week')}
            >
              Esta semana
            </button>
            <button
              type="button"
              className={`q-chip-btn ${closingsRange === 'month' ? 'active' : ''}`}
              onClick={() => setClosingsRange('month')}
            >
              Este mes
            </button>
          </div>
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetCloseForm()
              setShowCloseForm(true)
            }}
          >
            Cerrar turno
          </button>
        </div>
      </header>

      {showCloseForm ? (
        <section className="q-close-form-wrap">
          <header className="q-close-form-header">
            <h2>Cerrar turno</h2>
            <button type="button" className="q-link-btn" onClick={() => setShowCloseForm(false)}>
              Volver a la lista
            </button>
          </header>
          <form className="q-close-form-grid" onSubmit={handleCreateClosing}>
            <section className="q-card q-close-form-main">
              <div className="q-field-grid-2">
                <label className="q-field">
                  Fecha
                  <input
                    type="date"
                    required
                    value={closeDraft.date}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, date: event.target.value }))
                    }
                  />
                </label>

                <label className="q-field">
                  Tipo de turno
                  <select
                    value={closeDraft.type}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({
                        ...prev,
                        type: event.target.value as ClosingDraft['type'],
                      }))
                    }
                  >
                    {shiftTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatShiftType(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="q-field-grid-3">
                <label className="q-field">
                  Fondo inicial
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.openingCash}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, openingCash: asNumber(event.target.value) }))
                    }
                  />
                </label>
                <label className="q-field">
                  Retiros
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.cashWithdrawn}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({
                        ...prev,
                        cashWithdrawn: asNumber(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="q-field">
                  Efectivo contado
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.countedCash}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, countedCash: asNumber(event.target.value) }))
                    }
                  />
                </label>
              </div>

              <h3>Líneas de venta</h3>
              <div className="q-lines-wrap">
                {closeDraft.lines.map((line, index) => (
                  <article className="q-line-row" key={`${line.channel}-${line.method}-${index}`}>
                    <label className="q-field">
                      Canal
                      <select
                        value={line.channel}
                        onChange={(event) => {
                          const nextChannel = event.target.value as ShiftLineDraft['channel']
                          updateShiftLine(index, {
                            channel: nextChannel,
                            feePct: defaultFeeByChannel[nextChannel],
                          })
                        }}
                      >
                        {lineChannels.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="q-field">
                      Método
                      <select
                        value={line.method}
                        onChange={(event) =>
                          updateShiftLine(index, {
                            method: event.target.value as ShiftLineDraft['method'],
                          })
                        }
                      >
                        {lineMethods.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="q-field">
                      Monto
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.gross}
                        onChange={(event) =>
                          updateShiftLine(index, { gross: asNumber(event.target.value) })
                        }
                      />
                    </label>
                    <label className="q-field">
                      Fee %
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.feePct}
                        onChange={(event) =>
                          updateShiftLine(index, { feePct: asNumber(event.target.value) })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() => removeShiftLine(index)}
                      disabled={closeDraft.lines.length <= 1}
                    >
                      Quitar
                    </button>
                  </article>
                ))}
              </div>
              <button type="button" className="q-link-btn" onClick={addShiftLine}>
                + Agregar línea
              </button>

              <label className="q-field">
                Notas
                <textarea
                  value={closeDraft.notes}
                  onChange={(event) =>
                    setCloseDraft((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  rows={3}
                />
              </label>

              {closeError ? <p className="q-error-text">{closeError}</p> : null}

              <button className="q-btn q-btn-inline" type="submit" disabled={savingClose}>
                {savingClose ? 'Guardando...' : 'Guardar cierre'}
              </button>
            </section>

            <aside className="q-card q-arqueo-panel">
              <h3>Panel de arqueo en vivo</h3>
              <p>
                <span>Esperado en caja</span>
                <strong className="q-mono">{formatMoney(closingTotals.expectedCash)}</strong>
              </p>
              <p>
                <span>Contado</span>
                <strong className="q-mono">{formatMoney(closeDraft.countedCash)}</strong>
              </p>
              <div className={`q-arqueo-result ${closingTotals.difference >= 0 ? 'ok' : 'falt'}`}>
                {closingTotals.difference >= 0
                  ? 'CUADRÓ ✓'
                  : `FALTANTE −${formatMoney(Math.abs(closingTotals.difference))}`}
              </div>
            </aside>
          </form>
        </section>
      ) : null}

      {!showCloseForm && loadingClosings ? <p>Cargando cierres...</p> : null}
      {!showCloseForm && closingsError ? <p className="q-error-text">{closingsError}</p> : null}

      {!showCloseForm && !loadingClosings && !closings.length ? (
        <section className="q-card q-empty-state">
          <h3>Aún no hay cierres en este rango</h3>
          <p>Registra el primer cierre de turno de {selectedLocationName || 'la sucursal'}.</p>
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetCloseForm()
              setShowCloseForm(true)
            }}
          >
            Cerrar mi primer turno
          </button>
        </section>
      ) : null}

      {!showCloseForm && !loadingClosings && closings.length ? (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Turno</th>
                <th>Responsable</th>
                <th className="is-right">Ventas</th>
                <th className="is-right">Arqueo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {closings.map((item) => {
                const grossTotal = item.lines.reduce((sum, line) => sum + Number(line.gross), 0)
                const difference = Number(item.difference)
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="q-table-turn">
                        <strong>{formatShiftDate(item.shift.date)}</strong>
                        <span>
                          {formatShiftType(item.shift.type)} · {selectedLocationName || 'Sucursal'}
                        </span>
                      </div>
                    </td>
                    <td>{item.closedBy?.name || '—'}</td>
                    <td className="is-right q-mono">{formatMoney(grossTotal)}</td>
                    <td className="is-right q-mono">{formatMoney(difference)}</td>
                    <td>
                      <span className={`q-chip ${difference >= 0 ? 'ok' : 'falt'}`}>
                        {difference >= 0 ? '✓ Cuadró' : `Faltante −${formatMoney(Math.abs(difference))}`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )

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

          {!loadingUser && activeItem === 'Cierres de turno' ? renderShiftClosings() : null}

          {!loadingUser && activeItem !== 'Dashboard' && activeItem !== 'Cierres de turno' ? (
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
