// App.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { Show, SignIn } from '@clerk/react'
import NavBar from './components/NavBar'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Upload from './pages/Upload'
import './App.css'
import ConnectBank from './pages/ConnectBank'
import Imports from './pages/Imports'
import Budget from './pages/Budget'
import { useState } from 'react'
import CautionCard from './components/CautionCard'



export default function App() {
  const [showCaution, setShowCaution] = useState(true)

  function handleCautionCard() {
    setShowCaution(false)
  }

  return (
    <>
      {/* ── Signed out: show the landing / login page ── */}
      <Show when="signed-out">
        {showCaution && (
          <CautionCard onDismiss={handleCautionCard} />
        )}
        <div className="landing">
          <div className="landing-left">
            <div className="brand">
              <span className="brand-icon">🦉</span>
              <span className="brand-name">Wallet Wise</span>
            </div>
            <h1>Your money,<br />clearly understood.</h1>
            <p>Track spending, analyze trends, and take control of your financial life — all in one place.</p>
            <ul className="feature-list">
              <li>✦ Connect all your financial accounts</li>
              <li>✦ See spending trends &amp; insights</li>
              <li>✦ Set budget goals &amp; use tracking metrics</li>
            </ul>
          </div>
          <div className="landing-right">
            <div className="signin-card">
              <h2>Get started</h2>
              <p className="signin-sub">Sign in or create a free account</p>
              <SignIn routing="hash" />
            </div>
          </div>
        </div>
      </Show>

      {/* ── Signed in: show the app shell ── */}
      <Show when="signed-in">
        <div className="app-shell">
          <NavBar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/upload"       element={<Upload />} />
              <Route path="/connect" element={<ConnectBank />} />
              <Route path="/imports" element={<Imports />} />
              <Route path="/budget"  element={<Budget />} />
            </Routes>
          </main>
        </div>
      </Show>
    </>
  )
}
