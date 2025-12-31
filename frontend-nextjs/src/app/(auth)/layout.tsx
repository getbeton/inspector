import React from 'react'

export default function AuthLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6">
        {children}
      </div>
    </div>
  )
}
