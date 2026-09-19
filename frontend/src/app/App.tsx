import React, { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { useUIStore } from '../stores/ui.store'
import IDEShell from '../components/layout/IDEShell'

export default function App() {
  const { theme } = useUIStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    // reducedMotion="user": transform/layout animations are disabled for people who ask the OS for less motion.
    <MotionConfig reducedMotion="user">
      <div className="h-screen w-screen overflow-hidden flex flex-col font-sans bg-[var(--bg-app)] text-[var(--text-primary)]">
        <IDEShell />
      </div>
    </MotionConfig>
  )
}
