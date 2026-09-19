import React, { memo, useRef, useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import type { KeyValue } from '../types'
import { shortId } from '../lib/format'
import { isSensitiveName, isVariableReference } from '../lib/redact'
import { IconButton } from './ui'

export const HEADER_NAMES = [
  'Accept', 'Accept-Charset', 'Accept-Encoding', 'Accept-Language', 'Authorization', 'Cache-Control', 'Connection', 'Content-Type', 'Content-Length', 'Cookie', 'If-Match', 'If-Modified-Since', 'If-None-Match',
  'Origin', 'Pragma', 'Range', 'Referer', 'User-Agent', 'X-API-Key', 'X-Forwarded-For', 'X-Requested-With', 'X-Request-ID', 'X-CSRF-Token',
]

interface Props {
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  suggestKeys?: boolean
  maskSensitive?: boolean
  emptyHint?: React.ReactNode
}

/** Editable key/value table with an always-present blank row, enable toggles, and masking for credential-like values. */
export function KeyValueEditor({ rows, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', suggestKeys, maskSensitive }: Props) {
  const blankId = useRef(shortId())
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const update = (id: string, patch: Partial<KeyValue>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id))
  const addFromBlank = (patch: Partial<KeyValue>) => {
    const id = blankId.current
    blankId.current = shortId()
    onChange([...rows, { id, key: '', value: '', enabled: true, ...patch }])
  }
  const toggleReveal = (id: string) =>
    setRevealed((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const all = [...rows, { id: blankId.current, key: '', value: '', enabled: true } as KeyValue]
  return (
    <div className="min-w-0">
      {suggestKeys && (
        <datalist id="af-header-names">
          {HEADER_NAMES.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      )}
      <div className="af-kv-head" style={{ gridTemplateColumns: '20px minmax(0,1fr) minmax(0,1.5fr) 26px' }}>
        <span />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        <span />
      </div>
      {all.map((row, i) => {
        const isBlank = i === rows.length
        return (
          <KvRow
            key={row.id}
            row={row}
            isBlank={isBlank}
            listId={suggestKeys ? 'af-header-names' : undefined}
            mask={!!maskSensitive && isSensitiveName(row.key) && !isVariableReference(row.value) && !revealed.has(row.id)}
            canMask={!!maskSensitive && isSensitiveName(row.key) && !isVariableReference(row.value)}
            revealed={revealed.has(row.id)}
            onReveal={() => toggleReveal(row.id)}
            keyPlaceholder={keyPlaceholder}
            valuePlaceholder={valuePlaceholder}
            onPatch={(patch) => (isBlank ? addFromBlank(patch) : update(row.id, patch))}
            onRemove={() => remove(row.id)}
          />
        )
      })}
    </div>
  )
}

const KvRow = memo(function KvRow({
  row,
  isBlank,
  listId,
  mask,
  canMask,
  revealed,
  onReveal,
  keyPlaceholder,
  valuePlaceholder,
  onPatch,
  onRemove,
}: {
  row: KeyValue
  isBlank: boolean
  listId?: string
  mask: boolean
  canMask: boolean
  revealed: boolean
  onReveal: () => void
  keyPlaceholder: string
  valuePlaceholder: string
  onPatch: (patch: Partial<KeyValue>) => void
  onRemove: () => void
}) {
  return (
    <div className="af-kv-row" data-disabled={!row.enabled && !isBlank} style={{ gridTemplateColumns: '20px minmax(0,1fr) minmax(0,1.5fr) 26px' }}>
      {isBlank ? <span /> : <input type="checkbox" className="af-check" checked={row.enabled} onChange={(e) => onPatch({ enabled: e.target.checked })} aria-label={`Enable ${row.key || 'row'}`} />}
      <input
        className="af-input"
        value={row.key}
        list={listId}
        placeholder={isBlank ? keyPlaceholder : ''}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onPatch({ key: e.target.value })}
        aria-label="Key"
      />
      <div className="relative min-w-0">
        <input
          className="af-input"
          style={canMask ? { paddingRight: 28 } : undefined}
          value={row.value}
          type={mask ? 'password' : 'text'}
          placeholder={isBlank ? valuePlaceholder : ''}
          spellCheck={false}
          autoComplete="off"
          data-1p-ignore
          onChange={(e) => onPatch({ value: e.target.value })}
          aria-label="Value"
        />
        {canMask && (
          <button type="button" className="af-icon-btn absolute right-0.5 top-0" style={{ width: 24, height: 24 }} onClick={onReveal} aria-label={revealed ? 'Hide value' : 'Show value'} tabIndex={-1}>
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      {isBlank ? <span /> : (
        <IconButton label="Remove" tone="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      )}
    </div>
  )
})

/** Input that hides its value until revealed. Used for tokens, passwords and client secrets. */
export function SecretInput({ value, onChange, placeholder, className, id, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; id?: string; ariaLabel?: string }) {
  const [show, setShow] = useState(false)
  const isRef = isVariableReference(value)
  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        id={id}
        aria-label={ariaLabel}
        className="af-input af-mono"
        style={{ paddingRight: 30 }}
        type={show || isRef ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        data-1p-ignore
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="af-icon-btn absolute right-0.5 top-0.5" style={{ width: 24, height: 24 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide' : 'Show'} tabIndex={-1}>
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}
