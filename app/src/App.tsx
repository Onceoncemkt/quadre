import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PwaInstallBanner } from './components/PwaInstallBanner'
import { AppShellPage } from './pages/AppShellPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ProtectedRoute } from './router/ProtectedRoute'

function App() {
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('q-pwa-banner-visible', bannerVisible)
    return () => document.body.classList.remove('q-pwa-banner-visible')
  }, [bannerVisible])
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <AppShellPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <PwaInstallBanner onVisibilityChange={setBannerVisible} />
    </>
  )
}

export default App