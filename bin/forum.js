#!/usr/bin/env node
// Starts the forum: opens this computer's account, serves the page on
// 127.0.0.1 and opens it in the browser. FORUM_DIR (data folder), FORUM_PORT,
// FORUM_NO_BROWSER=1 change the defaults.

import os from 'os'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { startForum } from '../lib/server.js'

const dir = process.env.FORUM_DIR || path.join(os.homedir(), '.hypergraph-forum')
const port = Number(process.env.FORUM_PORT) || 4790

let forum
try {
  forum = await startForum({ dir, port })
} catch (err) {
  const token = path.join(dir, 'token')
  console.log(`The forum could not start: ${err.message}`)
  console.log('Is it already running in another window? Then use that one.')
  if (fs.existsSync(token)) console.log(`Its link: http://127.0.0.1:${port}/login?token=${fs.readFileSync(token, 'utf8').trim()}`)
  process.exit(1)
}

const link = `${forum.url}/login?token=${forum.token}`
console.log('The forum is running. Keep this window open to stay online with your friends.')
console.log(`If the browser didn't open, open this link: ${link}`)
console.log(`Your data: ${dir}`)
if (!process.env.FORUM_NO_BROWSER) openBrowser(link)

let closing = false
process.on('SIGINT', async () => {
  if (closing) process.exit(1)
  closing = true
  console.log('Closing…')
  await forum.close()
  process.exit(0)
})

function openBrowser (url) {
  const [cmd, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '""', url]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).on('error', () => {}).unref()
}
