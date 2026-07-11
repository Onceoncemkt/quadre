import { useEffect, useMemo, useState } from 'react'

const DISMISSED_AT_KEY = 'quadre:pwa-install-dismissed-at'
const INSTALLED_KEY = 'quadre:pwa-installed'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

function isDismissedRecently() {
  if (typeof window === 'undefined') return false
  const raw = window.localStorage.getItem(DISMISSED_AT_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  if (!Number.isFinite(dismissedAt)) return false
  return Date.now() - dismissedAt < DISMISS_TTL_MS
}

function isMarkedInstalled() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(INSTALLED_KEY) === '1'
}

type Props = {
  onVisibilityChange?: (visible: boolean) => void
}

export function PwaInstallBanner({ onVisibilityChange }: Props) {
  const [isMobile, setIsMobile] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const isIos = useMemo(() => isIosDevice(), [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const currentInstalled = isStandaloneMode() || isMarkedInstalled()
    setInstalled(currentInstalled)
    setDismissed(isDismissedRecently())
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent
      installEvent.preventDefault()
      setDeferredPrompt(installEvent)
    }

    const onInstalled = () => {
      window.localStorage.setItem(INSTALLED_KEY, '1')
      setInstalled(true)
      setDeferredPrompt(null)
      setIosHelpOpen(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const visible = isMobile && !installed && !dismissed && (isIos || Boolean(deferredPrompt))

  useEffect(() => {
    onVisibilityChange?.(visible)
  }, [onVisibilityChange, visible])

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    setDismissed(true)
    setIosHelpOpen(false)
  }

  const onInstallClick = async () => {
    if (isIos) {
      setIosHelpOpen(true)
      return
    }
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      window.localStorage.setItem(INSTALLED_KEY, '1')
      setInstalled(true)
    }
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <>
      <div className="q-pwa-install-banner" role="region" aria-label="Instalación de app">
        <button
          className="q-pwa-install-close"
          type="button"
          onClick={dismiss}
          aria-label="Cerrar banner de instalación"
        >
          ×
        </button>
        <div className="q-pwa-install-main">
          <span className="q-pwa-install-mark" aria-hidden="true">
            Q✓
          </span>
          <p>Instala Quadre en tu celular 📲</p>
        </div>
        <button className="q-pwa-install-btn" type="button" onClick={onInstallClick}>
          {isIos ? 'Ver cómo' : 'Instalar'}
        </button>
      </div>
      {iosHelpOpen ? (
        <div className="q-pwa-ios-sheet" role="dialog" aria-modal="true" aria-label="Cómo instalar en iPhone">
          <div className="q-pwa-ios-sheet-card">
            <h3>Instalar en iPhone</h3>
            <ol>
              <li>Toca el botón Compartir (□↑)</li>
              <li>Selecciona “Agregar a pantalla de inicio”</li>
              <li>Listo ✓</li>
            </ol>
            <div className="q-pwa-ios-sheet-actions">
              <button className="q-link-btn" type="button" onClick={() => setIosHelpOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
