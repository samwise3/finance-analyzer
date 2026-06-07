import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import App from './App.tsx'
import './index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// BrowserRouter enables client-side routing throughout the app.
// It must wrap everything so any component can use navigation hooks.
// ClerkProvider sits inside so Clerk has access to the router context.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProvider publishableKey={publishableKey}>
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
)