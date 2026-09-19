import React from 'react'
import { cn } from '@/lib/utils'

export interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  iconOnly?: boolean
  className?: string
  onClick?: () => void
}

const SIZE_CLASSES = {
  xs: { icon: 'w-6 h-6', full: 'h-5' },
  sm: { icon: 'w-7 h-7', full: 'h-6' },
  md: { icon: 'w-8 h-8', full: 'h-7' },
  lg: { icon: 'w-10 h-10', full: 'h-9' },
  xl: { icon: 'w-12 h-12', full: 'h-11' },
}

export function Logo({
  size = 'md',
  iconOnly = false,
  className,
  onClick,
}: LogoProps) {
  const sizeConfig = SIZE_CLASSES[size] || SIZE_CLASSES.md

  if (iconOnly) {
    return (
      <div
        onClick={onClick}
        className={cn(
          'relative overflow-hidden rounded-lg shrink-0 flex items-center justify-start select-none bg-[var(--bg-card)] border border-[var(--border-subtle)]',
          sizeConfig.icon,
          onClick && 'cursor-pointer hover:opacity-90 transition-opacity',
          className
        )}
        title="CodePilot AI"
      >
        <img
          src="/logo.png"
          alt="CodePilot AI"
          className="h-full w-auto max-w-none object-cover object-left scale-125 -translate-x-0.5"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center shrink-0 select-none',
        onClick && 'cursor-pointer hover:opacity-90 transition-opacity',
        className
      )}
      title="CodePilot AI"
    >
      <img
        src="/logo.png"
        alt="CodePilot AI"
        className={cn('w-auto object-contain', sizeConfig.full)}
      />
    </div>
  )
}
