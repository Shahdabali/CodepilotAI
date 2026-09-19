import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Announced to screen readers; not shown (each modal draws its own header). */
  title: string
  description?: string
  children: React.ReactNode
  /** The modal draws its own heading with <ModalTitle>, so the hidden one is not added (avoids announcing it twice). */
  visibleTitle?: boolean
  /** Classes for the panel (width, height, radius…). */
  className?: string
  /** `top` docks the panel near the top (command palettes); `center` centres it. */
  placement?: 'center' | 'top'
}

/**
 * The one modal shell for the app. Radix supplies focus trapping/restoration, Escape, scroll lock and ARIA;
 * framer-motion supplies a spring entrance and an exit animation.
 */
export function Modal({ open, onOpenChange, title, description, children, className, placement = 'center', visibleTitle = false }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              />
            </Dialog.Overlay>
            <div
              className={cn(
                'pointer-events-none fixed inset-0 z-50 flex justify-center p-4',
                placement === 'top' ? 'items-start pt-[12vh]' : 'items-center'
              )}
            >
              <Dialog.Content asChild forceMount>
                <motion.div
                  className={cn(
                    'pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-pop)] outline-none',
                    className
                  )}
                  initial={{ opacity: 0, y: placement === 'top' ? -10 : 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.985, transition: { duration: 0.12 } }}
                  transition={springSnappy}
                >
                  {!visibleTitle && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
                  <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
                  {children}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/** The dialog's visible heading; it is also what assistive tech announces as the dialog's name. */
export function ModalTitle({ className, children, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title className={className} {...props}>
      {children}
    </Dialog.Title>
  )
}

export function ModalClose({ className, children, ...props }: React.ComponentProps<typeof Dialog.Close>) {
  return (
    <Dialog.Close className={className} {...props}>
      {children}
    </Dialog.Close>
  )
}
