import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

function App() {
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    businessType: '',
    email: '',
    whatsapp: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const waitlistEndpoint = useMemo(
    () => import.meta.env.VITE_WAITLIST_ENDPOINT || '',
    [],
  )
  const source = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const utmSource = params.get('utm_source')
    const utmCampaign = params.get('utm_campaign')
    if (!utmSource && !utmCampaign) return 'direct'
    return [utmSource ? `utm_source=${utmSource}` : '', utmCampaign ? `utm_campaign=${utmCampaign}` : '']
      .filter(Boolean)
      .join('|')
  }, [])

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (status !== 'idle') {
      setStatus('idle')
      setMessage('')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setMessage('')

    if (!waitlistEndpoint) {
      setStatus('error')
      setMessage('Falta configurar VITE_WAITLIST_ENDPOINT para recibir registros.')
      return
    }

    try {
      const response = await fetch(waitlistEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source,
        }),
      })
      if (!response.ok) {
        throw new Error('No se pudo enviar tu registro.')
      }
      setStatus('success')
      setMessage('Listo. Te agregamos a la lista de espera de Quadre.')
      setFormData({
        name: '',
        businessName: '',
        businessType: '',
        email: '',
        whatsapp: '',
      })
    } catch {
      setStatus('error')
      setMessage('Ocurrió un error enviando tu registro. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="min-h-screen bg-quadre-paper text-quadre-ink">
      <header className="border-b border-quadre-ink/10 bg-quadre-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <p className="font-display text-2xl font-extrabold tracking-tight">quadre ✓</p>
          <a
            href="#waitlist"
            className="rounded-full border border-quadre-reward/40 bg-quadre-reward px-4 py-2 text-sm font-bold text-quadre-ink transition hover:bg-quadre-reward/90"
          >
            Entrar a waitlist
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.2fr_0.8fr] md:py-20">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-quadre-green/30 bg-quadre-green/10 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-quadre-green">
              Donde todo cuadra
            </p>
            <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-6xl">
              Control de dinero para restaurantes y bares, turno por turno.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-quadre-ink/80">
              Quadre aterriza lo que no te dan los reportes diarios: arqueo físico por turno,
              faltante/sobrante y responsable con nombre. Si hoy no estás seguro de dónde se va el
              dinero, aquí empieza el orden.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full border border-quadre-green/20 bg-white px-3 py-1 font-mono text-sm tabular-nums shadow-sm">
                CUADRÓ ✓
              </span>
              <span className="rounded-full border border-quadre-danger/30 bg-white px-3 py-1 font-mono text-sm tabular-nums text-quadre-danger shadow-sm">
                Faltante -$1,240
              </span>
              <span className="rounded-full border border-quadre-ink/20 bg-white px-3 py-1 font-mono text-sm tabular-nums shadow-sm">
                Responsable: Caja noche
              </span>
            </div>
          </div>

          <aside className="rounded-2xl border border-quadre-ink/10 bg-white p-6 shadow-ticket">
            <p className="font-mono text-xs uppercase tracking-wider text-quadre-ink/60">
              El cuadre de hoy
            </p>
            <div className="my-4 border-t border-dashed border-quadre-ink/15" />
            <div className="space-y-3 font-mono text-sm tabular-nums">
              <div className="flex justify-between">
                <span>Efectivo contado</span>
                <strong>$12,430</strong>
              </div>
              <div className="flex justify-between">
                <span>Esperado sistema</span>
                <strong>$13,100</strong>
              </div>
              <div className="flex justify-between text-quadre-danger">
                <span>Faltante</span>
                <strong>-$670</strong>
              </div>
              <div className="flex justify-between">
                <span>Apps delivery (neto)</span>
                <strong>$8,915</strong>
              </div>
            </div>
            <div className="my-4 border-t border-dashed border-quadre-ink/15" />
            <p className="text-sm text-quadre-ink/70">
              Cierres por turno con evidencia y trazabilidad para dueño y gerente.
            </p>
          </aside>
        </section>

        <section className="bg-white py-14 md:py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              Cinco módulos para que el dinero de verdad cuadre
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                'Cierres de turno con arqueo',
                'Egresos + P&L automático',
                'Proveedores, adeudos y pagos',
                'Requisiciones costeadas',
                'Nómina desde checador biométrico',
              ].map((module) => (
                <article
                  key={module}
                  className="rounded-xl border border-quadre-ink/10 bg-quadre-paper p-4 text-sm font-semibold"
                >
                  {module}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-quadre-ink py-14 text-white md:py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h3 className="font-display text-3xl font-black tracking-tight md:text-4xl">
              Diferenciador: cierre por turno, no solo corte diario
            </h3>
            <p className="mt-4 max-w-3xl text-white/80">
              Cada turno termina con arqueo real, variación exacta y persona responsable.
              Evitamos “doble captura” de dinero entre compras, requisiciones y nómina para que el
              P&L se mantenga limpio desde la operación.
            </p>
          </div>
        </section>

        <section id="waitlist" className="mx-auto max-w-4xl px-6 py-14 md:py-20">
          <div className="rounded-2xl border border-quadre-ink/10 bg-white p-6 shadow-ticket md:p-8">
            <h4 className="font-display text-3xl font-black tracking-tight">Entrar a la waitlist</h4>
            <p className="mt-2 text-quadre-ink/70">
              Abrimos lugares por bloques para implementación acompañada.
            </p>

            <form className="mt-7 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="text-sm font-semibold">
                Nombre
                <input
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-quadre-ink/20 bg-white px-3 py-2 font-normal outline-none ring-quadre-green/30 focus:ring-2"
                />
              </label>
              <label className="text-sm font-semibold">
                Negocio
                <input
                  required
                  value={formData.businessName}
                  onChange={(e) => handleChange('businessName', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-quadre-ink/20 bg-white px-3 py-2 font-normal outline-none ring-quadre-green/30 focus:ring-2"
                />
              </label>
              <label className="text-sm font-semibold">
                Tipo de negocio
                <input
                  value={formData.businessType}
                  onChange={(e) => handleChange('businessType', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-quadre-ink/20 bg-white px-3 py-2 font-normal outline-none ring-quadre-green/30 focus:ring-2"
                  placeholder="Restaurante, bar, cafetería..."
                />
              </label>
              <label className="text-sm font-semibold">
                Email
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-quadre-ink/20 bg-white px-3 py-2 font-normal outline-none ring-quadre-green/30 focus:ring-2"
                />
              </label>
              <label className="text-sm font-semibold">
                WhatsApp
                <input
                  required
                  value={formData.whatsapp}
                  onChange={(e) => handleChange('whatsapp', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-quadre-ink/20 bg-white px-3 py-2 font-normal outline-none ring-quadre-green/30 focus:ring-2"
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full rounded-xl bg-quadre-green px-5 py-3 font-semibold text-white transition hover:bg-quadre-green/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? 'Enviando...' : 'Quiero acceso anticipado'}
                </button>
                {message && (
                  <p
                    className={`mt-3 text-sm ${
                      status === 'success' ? 'text-quadre-green' : 'text-quadre-danger'
                    }`}
                  >
                    {message}
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-quadre-ink/10 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-sm text-quadre-ink/65 md:flex-row md:items-center md:justify-between">
          <p>quadre.mx · Control de dinero para restaurantes y bares</p>
          <p className="font-mono">Julio 2026</p>
        </div>
      </footer>
    </div>
  )
}

export default App
