import { useEffect, useMemo, useState } from 'react'

// ============================================================
// QUADRE — Landing de waitlist v2
// Identidad: Tinta #101613 · Verde #0E8A57 · Cuadró #C1FF72
// Papel #F7F7F2 · Faltante #E4573D
// Tipos: Archivo (display) + Spline Sans Mono (dinero)
// ============================================================

const css = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Spline+Sans+Mono:wght@400;500;700&display=swap');

.q-root{
  --tinta:#22333D;--tinta2:#2C4150;--verde:#3E5866;--verdeh:#324A57;
  --cuadro:#C1FF72;--papel:#F7F7F2;--blanco:#fff;--falt:#E4573D;
  --gris:#5C6660;--linea:#E3E4DC;--lineaD:#3A505E;
  background:var(--papel);color:var(--tinta);
  font-family:'Archivo',sans-serif;font-size:17px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.q-root *{margin:0;padding:0;box-sizing:border-box;}
.q-mono{font-family:'Spline Sans Mono',monospace;font-variant-numeric:tabular-nums;}
.q-wrap{max-width:1080px;margin:0 auto;padding:0 24px;}

/* ---------- nav ---------- */
.q-nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;}
.q-logo{display:flex;align-items:center;gap:10px;}
.q-logo svg{width:34px;height:34px;}
.q-logo .w{font-variation-settings:'wdth' 118;font-weight:900;font-size:24px;letter-spacing:-.02em;}
.q-btn{
  display:inline-flex;align-items:center;gap:8px;background:var(--verde);color:#fff;
  border:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:15px;
  padding:12px 22px;border-radius:10px;text-decoration:none;
}
.q-btn:hover{background:var(--verdeh);}
.q-btn.big{font-size:17px;padding:15px 28px;}
.q-btn:disabled{opacity:.6;cursor:wait;}

/* ---------- hero ---------- */
.q-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;padding:56px 0 72px;}
@media(max-width:880px){.q-hero{grid-template-columns:1fr;padding:32px 0 56px;}}
.q-eyebrow{
  font-family:'Spline Sans Mono',monospace;font-size:12px;font-weight:500;
  letter-spacing:.2em;text-transform:uppercase;color:var(--verde);margin-bottom:16px;
}
.q-h1{
  font-variation-settings:'wdth' 118;font-weight:900;
  font-size:clamp(38px,6vw,58px);line-height:1.04;letter-spacing:-.025em;
}
css.q-h1 em{
  font-style:normal;color:var(--tinta);
  background:linear-gradient(transparent 8%, var(--cuadro) 8%, var(--cuadro) 94%, transparent 94%);
  padding:0 .14em;border-radius:.08em;
  -webkit-box-decoration-break:clone;box-decoration-break:clone;
}
.q-hero p{font-size:18px;color:var(--gris);margin:22px 0 30px;max-width:480px;}
.q-trust{font-family:'Spline Sans Mono',monospace;font-size:12.5px;color:var(--gris);margin-top:16px;letter-spacing:.04em;}

/* ---------- ticket ---------- */
.q-ticket{
  width:min(330px,100%);margin:0 auto;background:var(--tinta);color:var(--papel);
  padding:26px 24px 30px;font-family:'Spline Sans Mono',monospace;font-size:13px;
  font-variant-numeric:tabular-nums;line-height:1.5;
  box-shadow:0 24px 60px rgba(16,22,19,.28);
  --zz:10px;
  clip-path:polygon(0% var(--zz),4% 0%,8% var(--zz),12% 0%,16% var(--zz),20% 0%,24% var(--zz),28% 0%,32% var(--zz),36% 0%,40% var(--zz),44% 0%,48% var(--zz),52% 0%,56% var(--zz),60% 0%,64% var(--zz),68% 0%,72% var(--zz),76% 0%,80% var(--zz),84% 0%,88% var(--zz),92% 0%,96% var(--zz),100% 0%,100% calc(100% - var(--zz)),96% 100%,92% calc(100% - var(--zz)),88% 100%,84% calc(100% - var(--zz)),80% 100%,76% calc(100% - var(--zz)),72% 100%,68% calc(100% - var(--zz)),64% 100%,60% calc(100% - var(--zz)),56% 100%,52% calc(100% - var(--zz)),48% 100%,44% calc(100% - var(--zz)),40% 100%,36% calc(100% - var(--zz)),32% 100%,28% calc(100% - var(--zz)),24% 100%,20% calc(100% - var(--zz)),16% 100%,12% calc(100% - var(--zz)),8% 100%,4% calc(100% - var(--zz)),0% 100%);
}
.q-ticket .c{text-align:center;}
.q-ticket .marca{font-weight:700;letter-spacing:.26em;font-size:13.5px;margin-top:10px;}
.q-ticket .sub{font-size:10.5px;color:#8C968F;letter-spacing:.12em;margin-top:3px;}
.q-ticket .div{border-top:1px dashed #3A453F;margin:14px 0;}
.q-ticket .f{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;}
.q-ticket .f .l{color:#B7BFB9;}
.q-ticket .tot{font-weight:700;}
.q-falt{
  margin-top:14px;border:1.5px dashed var(--falt);border-radius:6px;
  padding:12px 10px;text-align:center;color:var(--falt);
}
.q-falt .s{font-weight:700;font-size:14px;letter-spacing:.1em;}
.q-falt .m{font-weight:700;font-size:23px;margin-top:2px;}
.q-falt .n{font-size:10px;color:#8C968F;margin-top:6px;letter-spacing:.05em;}
.q-ticket .pie{margin-top:16px;text-align:center;font-size:10.5px;color:#5E6B64;letter-spacing:.12em;}
.q-ticket .pie b{color:var(--cuadro);font-weight:700;}

/* ---------- secciones ---------- */
.q-perfora{border:none;border-top:2px dashed var(--linea);margin:0;}
.q-sec{padding:72px 0;}
.q-h2{
  font-variation-settings:'wdth' 115;font-weight:800;
  font-size:clamp(28px,4.4vw,40px);letter-spacing:-.02em;line-height:1.12;margin-bottom:14px;
}
.q-lead{font-size:18px;color:var(--gris);max-width:600px;}

/* dolores como líneas de corte */
.q-dolores{margin-top:36px;border-top:2px dashed var(--linea);}
.q-dolor{
  display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:baseline;
  padding:22px 4px;border-bottom:2px dashed var(--linea);
}
@media(max-width:680px){.q-dolor{grid-template-columns:auto 1fr;}}
.q-dolor .num{font-family:'Spline Sans Mono',monospace;font-weight:700;color:var(--falt);font-size:15px;}
.q-dolor h3{font-variation-settings:'wdth' 112;font-weight:800;font-size:20px;margin-bottom:4px;}
.q-dolor p{color:var(--gris);font-size:15.5px;max-width:560px;}
.q-dolor .tag{font-family:'Spline Sans Mono',monospace;font-size:12px;color:var(--falt);font-weight:700;white-space:nowrap;}
@media(max-width:680px){.q-dolor .tag{display:none;}}

/* módulos */
.q-mods{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:36px;}
.q-mod{background:var(--blanco);border:1px solid var(--linea);border-radius:14px;padding:24px;}
.q-mod .chip{
  display:inline-block;font-family:'Spline Sans Mono',monospace;font-size:11px;font-weight:700;
  letter-spacing:.1em;padding:4px 11px;border-radius:999px;margin-bottom:14px;
  background:rgba(14,138,87,.09);color:var(--verde);
}
.q-mod h3{font-variation-settings:'wdth' 112;font-weight:800;font-size:19px;margin-bottom:8px;}
.q-mod p{color:var(--gris);font-size:14.5px;}

/* banda diferenciador */
.q-dark{background:var(--tinta);color:var(--papel);}
.q-dark .q-h2{color:var(--papel);}
.q-dark .q-h2 em{font-style:normal;color:var(--cuadro);}
.q-dark .q-lead{color:#9AA49D;}
.q-cuadre{margin-top:34px;border-top:1px dashed var(--lineaD);max-width:640px;}
.q-crow{
  display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;
  padding:14px 0;border-bottom:1px dashed var(--lineaD);
}
.q-crow .who{font-weight:600;font-size:15px;}
.q-crow .who span{display:block;font-family:'Spline Sans Mono',monospace;font-size:11.5px;color:#7B857E;font-weight:400;}
.q-crow .amt{font-family:'Spline Sans Mono',monospace;font-size:15px;}
.q-crow .st{font-family:'Spline Sans Mono',monospace;font-size:12.5px;font-weight:700;}
.q-crow .st.ok{color:var(--cuadro);}
.q-crow .st.bad{color:var(--falt);}

/* founding */
.q-found{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;}
@media(max-width:880px){.q-found{grid-template-columns:1fr;}}
.q-benef{list-style:none;margin-top:24px;}
.q-benef li{padding:9px 0 9px 32px;position:relative;color:var(--gris);font-size:16px;}
.q-benef li::before{content:"✓";position:absolute;left:0;color:var(--verde);font-weight:800;}
.q-benef li strong{color:var(--tinta);}
.q-price{
  background:var(--blanco);border:1px solid var(--linea);border-radius:18px;
  padding:34px 32px;text-align:center;box-shadow:0 16px 44px rgba(16,22,19,.08);
}
.q-price .lab{
  font-family:'Spline Sans Mono',monospace;font-size:11.5px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--verde);font-weight:700;
}
.q-price .old{
  font-family:'Spline Sans Mono',monospace;color:var(--gris);
  text-decoration:line-through;font-size:17px;margin-top:18px;
}
.q-price .now{
  font-family:'Spline Sans Mono',monospace;font-variant-numeric:tabular-nums;
  font-weight:700;font-size:52px;letter-spacing:-.02em;line-height:1;margin-top:2px;
}
.q-price .now small{font-size:17px;font-weight:500;color:var(--gris);letter-spacing:0;}
.q-price .lock{font-size:14px;color:var(--gris);margin:10px 0 22px;}
.q-price .cupo{
  font-family:'Spline Sans Mono',monospace;font-size:12px;color:var(--falt);
  font-weight:700;letter-spacing:.08em;margin-top:14px;
}

/* form */
.q-form{max-width:640px;margin:36px auto 0;}
.q-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:640px){.q-grid2{grid-template-columns:1fr;}}
.q-field{display:block;font-size:13.5px;font-weight:700;}
.q-field input{
  width:100%;margin-top:7px;background:var(--blanco);border:1px solid var(--linea);
  border-radius:10px;padding:13px 14px;font-family:inherit;font-size:15.5px;color:var(--tinta);
}
.q-field input:focus{outline:2px solid var(--verde);outline-offset:1px;border-color:var(--verde);}
.q-msg{margin-top:16px;font-size:15px;font-weight:600;text-align:center;}
.q-msg.ok{color:var(--verde);}
.q-msg.err{color:var(--falt);}

/* faq */
.q-faq{max-width:680px;margin-top:32px;}
.q-faq details{border-bottom:2px dashed var(--linea);padding:18px 4px;}
.q-faq summary{font-weight:700;font-size:17px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px;}
.q-faq summary::after{content:"+";font-family:'Spline Sans Mono',monospace;color:var(--verde);font-weight:700;}
.q-faq details[open] summary::after{content:"−";}
.q-faq details p{color:var(--gris);font-size:15.5px;margin-top:10px;max-width:600px;}

/* footer */
.q-footer{
  padding:36px 0 52px;border-top:2px dashed var(--linea);
  display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;
  font-family:'Spline Sans Mono',monospace;font-size:12.5px;color:var(--gris);
}
.q-footer b{color:var(--verde);}

/* reveal */
.q-rev{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease;}
.q-rev.in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.q-rev{opacity:1;transform:none;transition:none;}}
`

function LogoQ({ size = 34, ink = '#101613', check = '#0E8A57' }: { size?: number; ink?: string; check?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Quadre">
      <circle cx="56" cy="52" r="38" stroke={ink} strokeWidth="13" />
      <path d="M62 74 L78 92 L112 44" stroke={check} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Ticket() {
  return (
    <div className="q-ticket" aria-hidden="true">
      <div className="c">
        <div className="marca">CORTE DE CAJA</div>
        <div className="sub">TU BAR · TURNO VESPERTINO · HOY</div>
      </div>
      <div className="div" />
      <div className="f"><span className="l">Efectivo</span><span>$6,420.00</span></div>
      <div className="f"><span className="l">Tarjeta</span><span>$9,830.00</span></div>
      <div className="f"><span className="l">Apps (neto)</span><span>$1,990.00</span></div>
      <div className="f tot"><span>TOTAL</span><span>$18,240.00</span></div>
      <div className="div" />
      <div className="f"><span className="l">Esperado en caja</span><span>$7,920.00</span></div>
      <div className="f"><span className="l">Contado en caja</span><span>$7,690.00</span></div>
      <div className="q-falt">
        <div className="s">✗ FALTANTE</div>
        <div className="m">−$230.00</div>
        <div className="n">RESPONSABLE: SIN ASIGNAR</div>
      </div>
      <div className="div" />
      <div className="pie">ESTO PASA TODAS LAS SEMANAS.<br /><b>quadre.mx ✓</b></div>
    </div>
  )
}

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

  const endpoint = useMemo(() => import.meta.env.VITE_WAITLIST_ENDPOINT || '', [])
  const source = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const utmSource = params.get('utm_source')
    const utmCampaign = params.get('utm_campaign')
    if (!utmSource && !utmCampaign) return 'direct'
    return [utmSource ? `utm_source=${utmSource}` : '', utmCampaign ? `utm_campaign=${utmCampaign}` : '']
      .filter(Boolean)
      .join('|')
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.q-rev')
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            obs.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!endpoint) {
      setStatus('error')
      setMessage('El formulario no está configurado todavía. Escríbenos a hola@quadre.mx')
      return
    }
    setStatus('loading')
    setMessage('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, source }),
      })
      if (!response.ok) throw new Error('request failed')
      const data = await response.json()
      setStatus('success')
      setMessage(
        data.idempotent
          ? 'Ya estabas en la lista — tu lugar sigue apartado ✓'
          : 'Listo, quedaste en la lista ✓ Te escribimos por WhatsApp antes del lanzamiento.',
      )
      setFormData({ name: '', businessName: '', businessType: '', email: '', whatsapp: '' })
    } catch {
      setStatus('error')
      setMessage('Algo falló al enviar. Intenta de nuevo o escríbenos a hola@quadre.mx')
    }
  }

  return (
    <div className="q-root">
      <style>{css}</style>

      <div className="q-wrap">
        <nav className="q-nav">
          <div className="q-logo">
            <img src="/logo.png" alt="Quadre" style={{height:38, width:'auto'}} />
          </div>
          <a className="q-btn" href="#waitlist">Unirme a la lista</a>
        </nav>

        {/* ================= HERO ================= */}
        <header className="q-hero">
          <div>
            <div className="q-eyebrow">Control de dinero para restaurantes y bares</div>
            <h1 className="q-h1">La caja no se cuadra sola. <em>Cuádrala.</em></h1>
            <p>
              Cierres de turno con arqueo, requisiciones costeadas, adeudos con proveedores y nómina
              desde tu checador. Quadre te dice cuánto ganaste de verdad — y quién responde cuando falta.
            </p>
            <a className="q-btn big" href="#waitlist">Quiero mi lugar de founding member</a>
            <div className="q-trust">CONSTRUIDO POR OPERADORES · VALIDADO EN UN BAR Y UN RESTAURANTE REALES</div>
          </div>
          <Ticket />
        </header>
      </div>

      <hr className="q-perfora" />

      {/* ================= DOLORES ================= */}
      <section className="q-sec">
        <div className="q-wrap q-rev">
          <div className="q-eyebrow">El agujero por donde se va tu utilidad</div>
          <h2 className="q-h2">Tu punto de venta te dice cuánto vendiste.<br />Nadie te dice si el dinero llegó a la caja.</h2>
          <div className="q-dolores">
            <div className="q-dolor">
              <span className="num q-mono">−$</span>
              <div>
                <h3>Faltantes sin responsable</h3>
                <p>Cada corte "más o menos cuadra". Al mes son miles de pesos que nadie vio salir y nadie firmó.</p>
              </div>
              <span className="tag">TODAS LAS SEMANAS</span>
            </div>
            <div className="q-dolor">
              <span className="num q-mono">+%</span>
              <div>
                <h3>Precios que suben callados</h3>
                <p>El proveedor te sube el aguacate 18% y te enteras tres semanas después — si te enteras.</p>
              </div>
              <span className="tag">SIN AVISO</span>
            </div>
            <div className="q-dolor">
              <span className="num q-mono">2AM</span>
              <div>
                <h3>La nómina en Excel de madrugada</h3>
                <p>Descargar el checador, corregir horarios, calcular retardos y extras a mano. Cada quincena.</p>
              </div>
              <span className="tag">CADA QUINCENA</span>
            </div>
          </div>
        </div>
      </section>

      <hr className="q-perfora" />

      {/* ================= MÓDULOS ================= */}
      <section className="q-sec">
        <div className="q-wrap q-rev">
          <div className="q-eyebrow">Qué hace Quadre</div>
          <h2 className="q-h2">Cinco módulos, una sola cadena de dinero</h2>
          <p className="q-lead">Todo alimenta tu estado de resultados sin capturar nada dos veces.</p>
          <div className="q-mods">
            <div className="q-mod">
              <span className="chip">CIERRES DE TURNO</span>
              <h3>Arqueo con responsable</h3>
              <p>Ventas por método y canal, efectivo esperado vs contado, evidencia en foto y nombre de quien cerró. Faltante detectado esa noche, no en el estado de cuenta.</p>
            </div>
            <div className="q-mod">
              <span className="chip">P&amp;L AUTOMÁTICO</span>
              <h3>Utilidad real, sin contador</h3>
              <p>Ingresos netos (comisiones de apps ya descontadas), costos y gastos por sucursal. Sabes cuánto ganaste por día, turno y mes.</p>
            </div>
            <div className="q-mod">
              <span className="chip">REQUISICIONES</span>
              <h3>Pedidos costeados antes de gastar</h3>
              <p>Tu equipo pide del catálogo con el último precio real. Apruebas sabiendo cuánto va a costar, y al recibir se compara contra lo cobrado.</p>
            </div>
            <div className="q-mod">
              <span className="chip">PROVEEDORES Y ADEUDOS</span>
              <h3>A quién le debes y para cuándo</h3>
              <p>Saldos vivos, vencimientos, pagos parciales e historial de precios por insumo — con alerta cuando algo sube. Incluye préstamos de socios.</p>
            </div>
            <div className="q-mod">
              <span className="chip">NÓMINA</span>
              <h3>Del checador al pago en minutos</h3>
              <p>Importa el archivo del biométrico y Quadre calcula días, retardos, extras y bonos con tus reglas. La quincena lista en minutos, no de madrugada.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= DIFERENCIADOR ================= */}
      <section className="q-sec q-dark">
        <div className="q-wrap q-rev">
          <div className="q-eyebrow">Por qué Quadre y no otro sistema</div>
          <h2 className="q-h2">Otros sistemas registran ventas por día.<br />Quadre cierra <em>por turno, con nombre</em>.</h2>
          <p className="q-lead">
            La diferencia entre "vendimos $19,390" y "faltaron $230 en el vespertino y lo cerró Heidy"
            es la diferencia entre un reporte y el control real de tu negocio.
          </p>
          <div className="q-cuadre q-mono">
            <div className="q-crow">
              <div className="who">Matutino · Donde Siempre<span>Cerró Luisa C. · 4:12 pm</span></div>
              <div className="amt">$8,340.00</div>
              <div className="st ok">CUADRÓ ✓</div>
            </div>
            <div className="q-crow">
              <div className="who">Matutino · Tulanyork<span>Cerró Xiomara V. · 4:35 pm</span></div>
              <div className="amt">$11,020.00</div>
              <div className="st ok">CUADRÓ ✓</div>
            </div>
            <div className="q-crow">
              <div className="who">Vespertino · Tulanyork<span>Cerró Heidy T. · 11:58 pm</span></div>
              <div className="amt">$19,390.00</div>
              <div className="st bad">FALTANTE −$230.00</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FOUNDING ================= */}
      <section className="q-sec">
        <div className="q-wrap q-rev">
          <div className="q-found">
            <div>
              <div className="q-eyebrow">Founding members</div>
              <h2 className="q-h2">Precio bloqueado de por vida para los primeros 30</h2>
              <ul className="q-benef">
                <li><strong>$299/mes para siempre</strong> — aunque el precio público suba, el tuyo no.</li>
                <li><strong>Onboarding personal por WhatsApp</strong> — te ayudamos a configurar tu operación.</li>
                <li><strong>Voz directa en el producto</strong> — lo que te duela a ti se construye primero.</li>
                <li><strong>Sin tarjeta hoy</strong> — apartas tu lugar y pagas hasta que Quadre esté en tus manos.</li>
              </ul>
            </div>
            <div className="q-price">
              <div className="lab">Precio Founding Member</div>
              <div className="old q-mono">$499/mes</div>
              <div className="now">$299<small>/mes MXN</small></div>
              <div className="lock">Bloqueado de por vida · incluye 1 sucursal</div>
              <a className="q-btn big" href="#waitlist">Apartar mi lugar</a>
              <div className="cupo">SOLO 30 LUGARES · SE ASIGNAN EN ORDEN DE REGISTRO</div>
            </div>
          </div>
        </div>
      </section>

      <hr className="q-perfora" />

      {/* ================= FORM ================= */}
      <section className="q-sec" id="waitlist">
        <div className="q-wrap q-rev">
          <div style={{ textAlign: 'center' }}>
            <div className="q-eyebrow">Lista de espera</div>
            <h2 className="q-h2">Aparta tu lugar</h2>
            <p className="q-lead" style={{ margin: '0 auto' }}>
              Sin costo y sin compromiso. Te contactamos por WhatsApp cuando abramos los primeros accesos.
            </p>
          </div>
          <form className="q-form" onSubmit={handleSubmit}>
            <div className="q-grid2">
              <label className="q-field">
                Nombre
                <input required value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
              </label>
              <label className="q-field">
                Nombre de tu negocio
                <input required value={formData.businessName} onChange={(e) => handleChange('businessName', e.target.value)} />
              </label>
              <label className="q-field">
                Tipo de negocio
                <input
                  value={formData.businessType}
                  onChange={(e) => handleChange('businessType', e.target.value)}
                  placeholder="Restaurante, bar, cafetería..."
                />
              </label>
              <label className="q-field">
                Email
                <input type="email" required value={formData.email} onChange={(e) => handleChange('email', e.target.value)} />
              </label>
              <label className="q-field" style={{ gridColumn: '1 / -1' }}>
                WhatsApp
                <input
                  required
                  value={formData.whatsapp}
                  onChange={(e) => handleChange('whatsapp', e.target.value)}
                  placeholder="10 dígitos"
                  inputMode="tel"
                />
              </label>
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button className="q-btn big" type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Enviando…' : 'Apartar mi lugar ✓'}
              </button>
            </div>
            {message && <div className={`q-msg ${status === 'success' ? 'ok' : 'err'}`}>{message}</div>}
          </form>
        </div>
      </section>

      <hr className="q-perfora" />

      {/* ================= FAQ ================= */}
      <section className="q-sec">
        <div className="q-wrap q-rev">
          <div className="q-eyebrow">Preguntas frecuentes</div>
          <h2 className="q-h2">Lo que todos preguntan</h2>
          <div className="q-faq">
            <details>
              <summary>¿Quadre reemplaza mi punto de venta?</summary>
              <p>No, y esa es la idea: Quadre convive con el POS que ya usas. Tu POS cobra; Quadre controla el dinero — cierres, arqueos, adeudos, nómina y utilidad real.</p>
            </details>
            <details>
              <summary>¿Necesito saber de contabilidad?</summary>
              <p>Cero. Quadre habla como se habla en un restaurante: corte, arqueo, faltante, quincena. Si tu gerente sabe cerrar caja, sabe usar Quadre.</p>
            </details>
            <details>
              <summary>¿Cuándo lanza?</summary>
              <p>Los primeros accesos se abren en las próximas semanas, en orden de registro. Los founding members entran primero y con onboarding personal.</p>
            </details>
            <details>
              <summary>¿Registrarme me compromete a pagar?</summary>
              <p>No. Apartar tu lugar es gratis. El precio de founding member ($299/mes de por vida) solo aplica si decides entrar cuando te toque acceso.</p>
            </details>
          </div>
        </div>
      </section>

      <footer className="q-footer">
        <div className="q-wrap" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LogoQ size={16} ink="#22333D" check="#3E5866" />
            quadre.mx · hecho en Hidalgo, México
          </span>
          <span>donde todo cuadra <b>✓</b></span>
        </div>
      </footer>
    </div>
  )
}

export default App
