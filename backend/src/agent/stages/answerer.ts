import { TaskContext } from '../context.js'
import { FileManager, type FileNode } from '../../workspace/file-manager.js'
import { getAIRouter } from '../../ai/index.js'

/** Modes that only read the project and answer — they must never write files or run builds. */
export const READ_ONLY_MODES = new Set(['EXPLAIN', 'REVIEW'])

const MAX_TREE_ENTRIES = 250
const MAX_FILE_CHARS = 12_000
const MAX_CONTEXT_FILES = 6
const ANCHOR_FILES = ['README.md', 'readme.md', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']

function flatten(nodes: FileNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (out.length >= MAX_TREE_ENTRIES) break
    if (n.type === 'directory') flatten(n.children ?? [], out)
    else out.push(n.path)
  }
  return out
}

/** `@file:src/a.ts`, `@folder:src`, or a bare relative path that exists in the project. */
function referencedPaths(command: string): string[] {
  const found = new Set<string>()
  for (const m of command.matchAll(/@(?:file|folder):\s*([^\s,;]+)/g)) found.add(m[1])
  return [...found]
}

export class ReadOnlyResponder {
  /** Reads the project, asks the model, and returns markdown. Writes nothing. */
  async run(ctx: TaskContext): Promise<string> {
    ctx.emitEvent('stage_change', 'INSPECTING', 'Reading the project (read-only)')
    const fm = new FileManager(ctx.project.path, ctx.taskId)

    const tree = flatten(await fm.listFiles('.', 6))
    const wanted = new Set<string>()
    for (const ref of referencedPaths(ctx.command)) {
      if (tree.includes(ref)) wanted.add(ref)
      else for (const t of tree) if (t.startsWith(ref.replace(/\/?$/, '/'))) wanted.add(t)
    }
    for (const a of ANCHOR_FILES) if (tree.includes(a)) wanted.add(a)

    const snippets: string[] = []
    for (const file of [...wanted].slice(0, MAX_CONTEXT_FILES)) {
      ctx.assertActive()
      try {
        const text = await fm.readFile(file)
        snippets.push(`### ${file}\n\`\`\`\n${text.slice(0, MAX_FILE_CHARS)}${text.length > MAX_FILE_CHARS ? '\n…(truncated)' : ''}\n\`\`\``)
        ctx.emitEvent('log', 'INSPECTING', `Read ${file}`)
      } catch {
        /* unreadable / binary — skip */
      }
    }

    ctx.assertActive()
    ctx.emitEvent('stage_change', 'UNDERSTANDING', ctx.mode === 'REVIEW' ? 'Reviewing the code' : 'Working out an explanation')

    const prompt = [
      `Project: ${ctx.project.name} (${[ctx.project.language, ctx.project.framework].filter(Boolean).join(' / ') || 'unknown stack'})`,
      `Request (${ctx.mode}): ${ctx.command}`,
      `File tree (${tree.length}${tree.length >= MAX_TREE_ENTRIES ? '+' : ''} files):\n${tree.join('\n')}`,
      snippets.length ? `Relevant files:\n\n${snippets.join('\n\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const system =
      ctx.mode === 'REVIEW'
        ? 'You are a meticulous senior code reviewer. Only report issues you can point to in the files provided; cite file paths. Group findings by severity. Do not invent files. Answer in concise GitHub-flavored markdown.'
        : 'You are a senior engineer explaining a codebase to a colleague. Ground every statement in the files provided and cite file paths. If something is not visible in the provided context, say so. Answer in concise GitHub-flavored markdown.'

    const ai = getAIRouter()
    const answer = await ai.generate(prompt, { systemPrompt: system }, ctx.mode === 'REVIEW' ? 'CODE_REVIEW' : 'PROJECT_ANALYSIS')
    ctx.assertActive()
    return answer.trim()
  }
}
