import React from 'react'
import { ChevronDown, Layers, Lock, Settings } from 'lucide-react'
import { useSession } from '../session.store'
import { useDataStore } from '../data.store'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from './ui'
import type { Environment } from '../types'

export function useActiveEnv(): Environment | null {
  const id = useSession((s) => s.activeEnvId)
  const envs = useDataStore((s) => s.environments)
  return React.useMemo(() => envs.find((e) => e.id === id) ?? null, [envs, id])
}

export function EnvSelector() {
  const envs = useDataStore((s) => s.environments)
  const active = useActiveEnv()
  const setActiveEnv = useSession((s) => s.setActiveEnv)
  const setSection = useSession((s) => s.setSection)

  return (
    <Menu>
      <Tip label="Active environment: variables like {{API_URL}} resolve from it">
        <MenuTrigger asChild>
          <button type="button" className="af-btn" aria-label="Select environment">
            <Layers size={13} className={active ? 'text-[var(--af-accent-text)]' : 'text-[var(--af-text-3)]'} />
            <span className="af-truncate" style={{ maxWidth: 140 }}>
              {active ? active.name : 'No environment'}
            </span>
            <ChevronDown size={12} className="text-[var(--af-text-3)]" />
          </button>
        </MenuTrigger>
      </Tip>
      <MenuContent align="end" style={{ minWidth: 220 }}>
        <MenuLabel>Environment</MenuLabel>
        <MenuItem onSelect={() => setActiveEnv(null)}>
          <span className="text-[var(--af-text-2)]">No environment</span>
          {!active && <span className="ml-auto text-[10px] text-[var(--af-accent-text)]">active</span>}
        </MenuItem>
        {envs.map((e) => (
          <MenuItem key={e.id} onSelect={() => setActiveEnv(e.id)}>
            <span className="af-truncate">{e.name}</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--af-text-3)]">
              {e.variables.some((v) => v.secret) && <Lock size={10} />}
              {e.variables.length}
              {active?.id === e.id && <span className="text-[var(--af-accent-text)]">active</span>}
            </span>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<Settings size={14} />} onSelect={() => setSection('environments')}>
          Manage environments…
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
