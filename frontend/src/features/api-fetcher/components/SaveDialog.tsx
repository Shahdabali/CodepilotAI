import React, { useEffect, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { useDataStore } from '../data.store'
import { useDialogs } from '../dialogs.store'
import { flattenCollections } from '../lib/tree'
import { useSession } from '../session.store'
import { errorMessage, toast } from '../toast'
import { Button, Field, Modal } from './ui'

export function SaveDialog() {
  const { save, closeSave } = useDialogs()
  const data = useDataStore()
  const draft = useSession((s) => s.draft)
  const markSaved = useSession((s) => s.markSaved)
  const setPanel = useSession((s) => s.setPanel)
  const [name, setName] = useState('')
  const [collectionId, setCollectionId] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (save.open) {
      setName(save.suggestedName)
      setCollectionId(save.collectionId ?? '')
      setNewName('')
      setCreating(false)
      setError(null)
    }
  }, [save.open, save.suggestedName, save.collectionId])

  const flat = flattenCollections(data.collections)

  const submit = async () => {
    const finalName = name.trim()
    if (!finalName) {
      setError('Give the request a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let target: string | null = collectionId || null
      if (creating && newName.trim()) target = (await data.createCollection(newName.trim(), collectionId || null)).id
      const def = save.def ?? draft
      const saved = await data.createRequest(finalName, target, { ...def, name: finalName })
      if (!save.def) markSaved(saved.id, { ...draft, name: finalName })
      toast.success('Request saved', target ? `In “${data.collections.find((c) => c.id === target)?.name ?? newName.trim()}”` : 'In Saved Requests')
      setPanel('collections')
      closeSave()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={save.open}
      onOpenChange={(o) => !o && closeSave()}
      title="Save request"
      description="Choose a name and where it lives."
      width={460}
      footer={
        <>
          <Button onClick={closeSave}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Name">
          <input className="af-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Get users" />
        </Field>
        <Field label="Collection">
          <select className="af-input" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">Saved requests (no collection)</option>
            {flat.map(({ collection, depth }) => (
              <option key={collection.id} value={collection.id}>
                {'  '.repeat(depth)}
                {depth ? '↳ ' : ''}
                {collection.name}
              </option>
            ))}
          </select>
        </Field>
        {creating ? (
          <Field label={collectionId ? 'New sub-collection name' : 'New collection name'}>
            <input className="af-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My APIs" />
          </Field>
        ) : (
          <button type="button" className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--af-accent-text)] hover:underline" onClick={() => setCreating(true)}>
            <FolderPlus size={13} /> Create a new collection{collectionId ? ' inside the selected one' : ''}
          </button>
        )}
        {error && <div className="text-[11.5px] text-[var(--af-err)]">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
