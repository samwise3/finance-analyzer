import { SignIn, Show, UserButton } from '@clerk/react'
import './App.css'

export default function App() {
  return (
    <>
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

      <Show when="signed-in">
        <div className="dashboard-shell">
          <header className="topbar">
            <div className="brand">
              <span className="brand-icon">📊</span>
              <span className="brand-name">FinanceAnalyzer</span>
            </div>
            <UserButton />
          </header>
          <main className="dashboard-main">
            <h1>Welcome back</h1>
            <p className="dashboard-sub">Your dashboard is coming soon.</p>
          </main>
        </div>
      </Show>
    </>
  )
}
