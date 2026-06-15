// App.tsx
// The root component. It has two responsibilities:
//   1. Show the landing/login page when the user is signed out
//   2. Show the app shell (sidebar + page content) when signed in
//
// The shell layout is: NavBar fixed on the left, main content fills the rest.
// React Router's <Routes> decides which page component to render based on the URL.

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




export default function App() {
  return (
    <>
      {/* ── Signed out: show the landing / login page ── */}
      <Show when="signed-out">
        <div className="landing">
          <div className="landing-left">
            <div className="brand">
              <span className="brand-icon">📊</span>
              <span className="brand-name">FinanceAnalyzer</span>
            </div>
            <h1>Your money,<br />clearly understood.</h1>
            <p>Track spending, analyze trends, and take control of your financial life — all in one place.</p>
            <ul className="feature-list">
              <li>✦ Automatic transaction categorization</li>
              <li>✦ Spending trends &amp; insights</li>
              <li>✦ Budget tracking &amp; alerts</li>
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

          {/* Sidebar — always mounted, expands on hover via CSS */}
          <NavBar />

          {/*
            Main content area. The left padding (64px) matches the collapsed
            navbar width so content is never hidden behind it.
          */}
          <main className="app-main">
            <Routes>
              {/* Redirect the root URL to /dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/upload"       element={<Upload />} />
              <Route path="/connect" element={<ConnectBank />} />
              <Route path="/imports" element={<Imports />} />
              <Route path="/budget"  element={<Budget />} />

              {/*
                TODO: Add routes here as you build new sections:
                <Route path="/credit"      element={<Credit />} />
                <Route path="/investments" element={<Investments />} />
              */}
            </Routes>
          </main>

        </div>
      </Show>
    </>
  )
}
