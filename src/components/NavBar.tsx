// NavBar.tsx
// A sidebar that lives on the left edge of the screen at all times.
// It starts collapsed (showing only icons) and expands on hover to
// reveal labels. This is handled entirely in CSS using the .nav-expanded
// class — no JavaScript state needed for the hover behavior.

import { NavLink } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import './NavBar.css'

// Each entry in this array becomes one nav item.
// To add a new section later (credit cards, investments, budget),
// just add an object here — no other changes needed.
const NAV_ITEMS = [
  { to: '/dashboard',     icon: '📊', label: 'Dashboard'    },
  { to: '/transactions',  icon: '📋', label: 'Transactions'  },
  { to: '/upload',        icon: '⬆️',  label: 'Upload'        },
  { to: '/connect', icon: '🏦', label: 'Connect Bank' },
  { to: '/imports', icon: '📁', label: 'Imports'    },
  { to: '/budget',  icon: '🎯', label: 'Budget'     },

  // TODO: Add these when you build out the later sections:
  // { to: '/credit',     icon: '💳', label: 'Credit Cards'  },
  // { to: '/investments',icon: '📈', label: 'Investments'    },
]

export default function NavBar() {
  return (
    <nav className="navbar">
      {/* Brand mark — visible in both collapsed and expanded states */}
      <div className="nav-brand">
        <span className="nav-icon">📊</span>
        <span className="nav-label">FinanceAnalyzer</span>
      </div>

      {/* Main nav links */}
      <ul className="nav-items">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <li key={to}>
            {/*
              NavLink is like a regular <a> but automatically adds an
              "active" class when the current URL matches its `to` prop.
              We use this to highlight the current page in the sidebar.
            */}
            <NavLink to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/*
        UserButton is a Clerk component that renders the user's avatar.
        Clicking it opens a dropdown with profile settings and sign out.
        It sits at the bottom of the nav.
      */}
      <div className="nav-footer">
        <UserButton />
        <span className="nav-label">Account</span>
      </div>
    </nav>
  )
}
