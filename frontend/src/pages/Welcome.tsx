import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { cn, getLanguageIcon } from '@/lib/utils'

export default function Welcome() {
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { projects, setProjects, addProject, setActiveProject } = useProjectStore()

  useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const list = await api.projects.list()
      setProjects(list)
      return list
    },
  })

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault()
    if (!path.trim()) return
    setLoading(true)
    setError(null)
    try {
      const project = await api.projects.create(path.trim())
      addProject(project)
    } catch (err: any) {
      setError(err.message || 'Failed to open project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-5xl">⚡</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
            CodePilot <span className="text-[var(--accent)]">AI</span>
          </h1>
          <p className="mt-3 text-[var(--text-secondary)] text-base leading-relaxed">
            Tell it what to build.
            <br />
            <span className="text-[var(--text-muted)]">Let it handle the engineering.</span>
          </p>
        </div>

        {/* Open project form */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
            Open a Project
          </h2>
          <form onSubmit={handleOpen} className="space-y-3">
            <div>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\you\my-project or /home/you/my-project"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-3 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all"
                autoFocus
              />
              {error && (
                <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                  <span>⚠</span> {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !path.trim()}
              className="w-full py-3 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing project…
                </>
              ) : (
                <>
                  <span>📂</span>
                  Open Project
                </>
              )}
            </button>
          </form>
        </div>

        {/* Recent projects */}
        {projects.length > 0 && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-color)]">
              <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Recent Projects</h2>
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {projects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors group"
                >
                  <span className="text-xl shrink-0">{getLanguageIcon(project.language)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {project.name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-mono truncate mt-0.5">
                      {project.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {project.language && (
                      <span className="text-[10px] bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[var(--text-muted)]">
                        {project.language}
                      </span>
                    )}
                    <span className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          ⚡ Powered by Gemini · Built for developers
        </p>
      </div>
    </div>
  )
}
