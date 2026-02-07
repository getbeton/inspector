// Re-export everything from supabase modules
export * from './types'

// Client-side exports (for 'use client' components)
export {
  createClient as createBrowserClient,
  signInWithGoogle,
  signOut,
  getSession as getBrowserSession,
  getUser as getBrowserUser
} from './client'

// Note: Server-side functions should be imported directly from './server'
// to avoid including server code in client bundles
