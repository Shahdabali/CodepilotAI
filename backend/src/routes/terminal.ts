import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from 'ws'
import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'

export const terminalPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ws/terminal/:sessionId', { websocket: true }, (socket: WebSocket, req) => {
    const query = req.query as { projectPath?: string }
    const projectPath = query.projectPath && fs.existsSync(query.projectPath)
      ? query.projectPath
      : process.cwd()

    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash'
    const shellArgs = os.platform() === 'win32' ? [] : []

    const child = spawn(shell, shellArgs, {
      cwd: projectPath,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: 'pipe',
    })

    child.stdout.on('data', (data: Buffer) => {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(data.toString())
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      if (socket.readyState === 1) {
        socket.send(data.toString())
      }
    })

    socket.on('message', (message: Buffer | string) => {
      try {
        child.stdin.write(message.toString())
      } catch { /* process may have exited */ }
    })

    socket.on('close', () => {
      try { child.kill() } catch { /* ignore */ }
    })

    child.on('exit', () => {
      try { socket.close() } catch { /* ignore */ }
    })

    child.on('error', (err) => {
      console.error('Terminal spawn error:', err)
      try { socket.close() } catch { /* ignore */ }
    })
  })
}
