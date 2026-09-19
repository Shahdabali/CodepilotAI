import React, { useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, FileWarning, Image as ImageIcon, ShieldAlert } from 'lucide-react'
import type { ExecuteSuccess } from '../types'
import { base64ToBlob } from '../lib/download'
import { formatBytes } from '../lib/format'
import { isSensitiveName } from '../lib/redact'
import { Badge, Button, Callout, CopyButton, EmptyState } from './ui'

// Scripts, forms, popups, same-origin access and every network request are blocked inside the preview frame.
const PREVIEW_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:">`

function useBlobUrl(base64: string | undefined, type: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!base64) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(base64ToBlob(base64, type || 'application/octet-stream'))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [base64, type])
  return url
}

export function PreviewView({ response, onDownload }: { response: ExecuteSuccess['response']; onDownload: () => void }) {
  const mime = response.contentType.split(';')[0].trim().toLowerCase()
  const blobUrl = useBlobUrl(response.bodyBase64, mime || 'application/octet-stream')
  const [dims, setDims] = useState<string | null>(null)
  const srcDoc = useMemo(() => (response.kind === 'html' ? `${PREVIEW_CSP}<base target="_blank">${response.bodyText ?? ''}` : ''), [response.kind, response.bodyText])

  if (response.kind === 'empty') return <EmptyState icon={<FileWarning size={18} />} title="Empty response body" description="The server returned no content." />

  if (response.kind === 'html') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Callout tone="info" icon={<ShieldAlert size={14} className="text-[var(--af-info)]" />} className="m-2 shrink-0 !py-1.5">
          <span className="text-[11.5px]">Safe preview: scripts, forms, navigation and all external resources are blocked. Use Raw to see the markup.</span>
        </Callout>
        <iframe title="Response preview" sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} className="min-h-0 flex-1 border-0" style={{ background: '#fff' }} />
      </div>
    )
  }
  if (response.kind === 'image') {
    return blobUrl ? (
      <div className="flex h-full min-h-0 flex-col">
        <div
          className="af-scroll flex min-h-0 flex-1 items-center justify-center p-4"
          style={{ backgroundImage: 'linear-gradient(45deg, var(--af-hover) 25%, transparent 25%), linear-gradient(-45deg, var(--af-hover) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--af-hover) 75%), linear-gradient(-45deg, transparent 75%, var(--af-hover) 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0' }}
        >
          <img src={blobUrl} alt="Response body" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}px`)} />
        </div>
        <div className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--af-border)] px-3 text-[11px] text-[var(--af-text-3)]">
          <ImageIcon size={12} /> {mime || 'image'} {dims && <span>· {dims}</span>} · {formatBytes(response.sizeBytes)}
        </div>
      </div>
    ) : (
      <TooLarge response={response} onDownload={onDownload} />
    )
  }
  if (response.kind === 'pdf') {
    return blobUrl ? <object data={blobUrl} type="application/pdf" className="h-full w-full" aria-label="PDF preview"><EmptyState title="Your browser cannot display this PDF inline" action={<Button onClick={onDownload}><Download size={13} /> Download</Button>} /></object> : <TooLarge response={response} onDownload={onDownload} />
  }
  if (response.kind === 'audio') return blobUrl ? <div className="grid h-full place-items-center p-6"><audio controls src={blobUrl} className="w-full max-w-md" /></div> : <TooLarge response={response} onDownload={onDownload} />
  if (response.kind === 'video') return blobUrl ? <div className="grid h-full place-items-center p-4"><video controls src={blobUrl} className="max-h-full max-w-full" /></div> : <TooLarge response={response} onDownload={onDownload} />
  if (response.kind === 'binary') {
    return (
      <EmptyState
        icon={<FileWarning size={18} />}
        title="Binary content"
        description={`${mime || 'Unknown type'} · ${formatBytes(response.sizeBytes)}. There is no visual preview for this type.`}
        action={
          <Button onClick={onDownload}>
            <Download size={13} /> Download {response.filename}
          </Button>
        }
      />
    )
  }
  return <EmptyState icon={<Eye size={18} />} title="No visual preview for this content type" description={`${mime || 'This response'} is text. Switch to Pretty or Raw to read it.`} />
}

function TooLarge({ response, onDownload }: { response: ExecuteSuccess['response']; onDownload: () => void }) {
  return (
    <EmptyState
      icon={<FileWarning size={18} />}
      title="Too large to preview inline"
      description={`${formatBytes(response.sizeBytes)} exceeds the inline preview limit. Download the file to view it.`}
      action={
        <Button onClick={onDownload}>
          <Download size={13} /> Download {response.filename}
        </Button>
      }
    />
  )
}

export function HeadersView({ outcome }: { outcome: ExecuteSuccess }) {
  const { response, request } = outcome
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setRevealed((s) => {
      const n = new Set(s)
      if (!n.delete(i)) n.add(i)
      return n
    })
  const table = (rows: Array<[string, string]>, maskable: boolean) => (
    <div className="overflow-hidden rounded-md border border-[var(--af-border)]">
      {rows.length === 0 && <div className="px-3 py-2 text-[11.5px] text-[var(--af-text-3)]">None</div>}
      {rows.map(([k, v], i) => {
        const sensitive = maskable && (k.toLowerCase() === 'set-cookie' || isSensitiveName(k))
        const hidden = sensitive && !revealed.has(i)
        return (
          <div key={`${k}-${i}`} className="group grid items-start gap-3 border-b border-[var(--af-border)] px-3 py-1.5 last:border-b-0 hover:bg-[var(--af-hover)]" style={{ gridTemplateColumns: 'minmax(120px, 220px) minmax(0, 1fr) auto' }}>
            <span className="af-mono break-all font-semibold text-[var(--af-syn-key)]">{k}</span>
            <span className="af-mono break-all text-[var(--af-text)]">{hidden ? '•'.repeat(Math.min(24, Math.max(8, v.length))) : v}</span>
            <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {sensitive && (
                <button type="button" className="af-icon-btn" onClick={() => toggle(i)} aria-label={hidden ? 'Reveal value' : 'Hide value'}>
                  {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              )}
              <CopyButton text={`${k}: ${v}`} label="Copy header" />
            </span>
          </div>
        )
      })}
    </div>
  )
  return (
    <div className="af-scroll h-full space-y-4 p-3">
      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="af-h">Response headers</span>
          <Badge>{response.headers.length}</Badge>
          <span className="ml-auto text-[11px] text-[var(--af-text-3)]">HTTP/{response.httpVersion}</span>
        </div>
        {table(response.headers, true)}
      </section>
      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="af-h">Request headers sent</span>
          <Badge>{request.headers.length}</Badge>
        </div>
        <p className="mb-1.5 text-[11px] text-[var(--af-text-3)]">Credentials are masked. This is what the CodePilot backend actually sent, including defaults it added.</p>
        {table(request.headers, false)}
      </section>
    </div>
  )
}
