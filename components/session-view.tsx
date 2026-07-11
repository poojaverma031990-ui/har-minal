'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Shell, type Line, type Segment } from '@/lib/shell'
import { ExtraKeys, type SpecialKey } from '@/components/extra-keys'
import { NanoEditor } from '@/components/nano-editor'

const colorClass: Record<NonNullable<Segment['color']>, string> = {
  fg: 'text-term-fg',
  green: 'text-term-green',
  blue: 'text-term-blue',
  yellow: 'text-term-yellow',
  red: 'text-term-red',
  dim: 'text-term-dim',
}

export type PromptData = { user: string; host: string; cwd: string }

export type Block =
  | { kind: 'output'; lines: Line[] }
  | { kind: 'command'; prompt: PromptData; command: string }

export function welcomeBlocks(): Block[] {
  return [
    {
      kind: 'output',
      lines: [
        [
          { text: 'Welcome to ', color: 'fg' },
          { text: 'har.minal', color: 'green', bold: true },
          { text: '!', color: 'fg' },
        ],
        [],
        [
          { text: 'Community forum: ', color: 'fg' },
          { text: 'https://harminal.dev/community', color: 'blue' },
        ],
        [
          { text: 'Gitter chat:     ', color: 'fg' },
          { text: 'https://gitter.im/harminal/harminal', color: 'blue' },
        ],
        [],
        [{ text: 'Working with packages:', color: 'fg' }],
        [{ text: ' - Search:  pkg search <query>', color: 'fg' }],
        [{ text: ' - Install: pkg install <package>', color: 'fg' }],
        [{ text: ' - Upgrade: pkg upgrade', color: 'fg' }],
        [],
        [{ text: "Type 'help' for the list of commands.", color: 'dim' }],
        [],
      ],
    },
  ]
}

const CMDS = [
  'help', 'ls', 'cd', 'pwd', 'cat', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'tree', 'find',
  'echo', 'clear', 'reset', 'whoami', 'hostname', 'uname', 'id', 'date', 'uptime', 'env',
  'export', 'history', 'head', 'tail', 'grep', 'wc', 'sort', 'uniq', 'rev', 'sed',
  'pkg', 'apt', 'pip', 'nano', 'vi', 'vim', 'which', 'basename', 'dirname', 'sleep',
  'seq', 'expr', 'printf', 'yes', 'man', 'sh', 'bash', 'chmod', 'cal', 'ps', 'top',
  'kill', 'du', 'df', 'free', 'neofetch', 'banner', 'fortune', 'cowsay', 'exit',
]

function renderLine(line: Line, key: number) {
  return (
    <div key={key} className="whitespace-pre-wrap break-words">
      {line.length === 0 ? (
        <span>&nbsp;</span>
      ) : (
        line.map((seg, i) => (
          <span
            key={i}
            className={`${colorClass[seg.color ?? 'fg']} ${seg.bold ? 'font-bold' : ''}`}
          >
            {seg.text}
          </span>
        ))
      )}
    </div>
  )
}

function Prompt({ data }: { data: PromptData }) {
  return (
    <span className="select-none">
      <span className="font-bold text-term-green">{data.cwd}</span>
      <span className="text-term-fg"> $ </span>
    </span>
  )
}

type SessionViewProps = {
  shell: Shell
  blocks: Block[]
  setBlocks: (updater: (prev: Block[]) => Block[]) => void
  fontSize: number
  onExit: () => void
  onTitle: (title: string) => void
  onMenu: () => void
}

export function SessionView({
  shell,
  blocks,
  setBlocks,
  fontSize,
  onExit,
  onTitle,
  onMenu,
}: SessionViewProps) {
  const [input, setInput] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [prompt, setPrompt] = useState<PromptData>({
    user: shell.env.USER,
    host: 'localhost',
    cwd: shell.shortCwd(),
  })
  const [histIndex, setHistIndex] = useState<number | null>(null)
  const [ctrl, setCtrl] = useState(false)
  const [alt, setAlt] = useState(false)
  const [editor, setEditor] = useState<{ path: string; content: string } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    })
  }, [])

  useEffect(() => {
    if (!editor) scrollToBottom()
  }, [blocks, input, editor, scrollToBottom])

  useEffect(() => {
    onTitle(shell.shortCwd())
  }, [prompt, shell, onTitle])

  const setInputValue = useCallback((value: string, caret?: number) => {
    const el = inputRef.current
    if (el) {
      el.value = value
      const pos = caret ?? value.length
      try {
        el.setSelectionRange(pos, pos)
      } catch {
        // ignore
      }
    }
    setInput(value)
    setCursorPos(caret ?? value.length)
  }, [])

  const focusInput = useCallback(() => {
    if (!editor) inputRef.current?.focus()
  }, [editor])

  const runCommand = useCallback(
    (command: string) => {
      const currentPrompt = { ...prompt }
      const result = shell.exec(command)
      setBlocks((prev) => {
        let next = [...prev, { kind: 'command', prompt: currentPrompt, command } as Block]
        if (result.clear) next = []
        if (result.lines.length > 0) next.push({ kind: 'output', lines: result.lines })
        return next
      })
      setPrompt({ user: shell.env.USER, host: 'localhost', cwd: shell.shortCwd() })
      setInputValue('')
      setHistIndex(null)
      if (result.editor) setEditor(result.editor)
      if (result.exit) onExit()
    },
    [prompt, shell, setBlocks, setInputValue, onExit],
  )

  const navigateHistory = (dir: 'up' | 'down') => {
    const hist = shell.history
    if (hist.length === 0) return
    let idx = histIndex
    if (dir === 'up') {
      idx = idx === null ? hist.length - 1 : Math.max(0, idx - 1)
    } else {
      if (idx === null) return
      idx = idx + 1
      if (idx >= hist.length) {
        setHistIndex(null)
        setInputValue('')
        return
      }
    }
    setHistIndex(idx)
    setInputValue(hist[idx])
  }

  const autocomplete = () => {
    const current = inputRef.current?.value ?? input
    const parts = current.split(' ')
    if (parts.length === 1 && parts[0]) {
      const matches = CMDS.filter((c) => c.startsWith(parts[0]))
      if (matches.length === 1) {
        setInputValue(matches[0] + ' ')
      } else if (matches.length > 1) {
        setBlocks((prev) => [
          ...prev,
          { kind: 'command', prompt: { ...prompt }, command: current },
          {
            kind: 'output',
            lines: [matches.map((m) => ({ text: m + '  ', color: 'fg' as const }))],
          },
        ])
      }
      return
    }
    const last = parts[parts.length - 1]
    const slash = last.lastIndexOf('/')
    const dirPart = slash >= 0 ? last.slice(0, slash + 1) : ''
    const namePart = slash >= 0 ? last.slice(slash + 1) : last
    const dirNode = shell.getNode(dirPart || '.')
    if (dirNode && dirNode.type === 'dir') {
      const matches = Object.keys(dirNode.children).filter((n) => n.startsWith(namePart))
      if (matches.length === 1) {
        const child = dirNode.children[matches[0]]
        parts[parts.length - 1] = dirPart + matches[0] + (child.type === 'dir' ? '/' : '')
        setInputValue(parts.join(' '))
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.nativeEvent as unknown as { isComposing: boolean }).isComposing || e.keyCode === 229)
      return

    if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(inputRef.current?.value ?? input)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      navigateHistory('up')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      navigateHistory('down')
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      autocomplete()
      return
    }
    if (ctrl && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      setBlocks(() => [])
      setCtrl(false)
      return
    }
    if (ctrl && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const cur = inputRef.current?.value ?? input
      setBlocks((prev) => [
        ...prev,
        { kind: 'command', prompt: { ...prompt }, command: cur + '^C' },
      ])
      setInputValue('')
      setCtrl(false)
      return
    }
  }

  const handleSpecialKey = (key: SpecialKey) => {
    focusInput()
    switch (key) {
      case 'ESC':
        setInputValue('')
        setCtrl(false)
        setAlt(false)
        break
      case 'CTRL':
        setCtrl((v) => !v)
        break
      case 'ALT':
        setAlt((v) => !v)
        break
      case 'TAB':
        autocomplete()
        break
      case 'UP':
        navigateHistory('up')
        break
      case 'DOWN':
        navigateHistory('down')
        break
      case 'LEFT': {
        const el = inputRef.current
        const pos = Math.max(0, (el?.selectionStart ?? cursorPos) - 1)
        el?.setSelectionRange(pos, pos)
        setCursorPos(pos)
        break
      }
      case 'RIGHT': {
        const el = inputRef.current
        const len = el?.value.length ?? input.length
        const pos = Math.min(len, (el?.selectionStart ?? cursorPos) + 1)
        el?.setSelectionRange(pos, pos)
        setCursorPos(pos)
        break
      }
      case 'HOME':
        inputRef.current?.setSelectionRange(0, 0)
        setCursorPos(0)
        break
      case 'END': {
        const len = inputRef.current?.value.length ?? input.length
        inputRef.current?.setSelectionRange(len, len)
        setCursorPos(len)
        break
      }
      case 'PGUP':
        scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * 0.8 })
        break
      case 'PGDN':
        scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.8 })
        break
      case '/':
      case '-': {
        const el = inputRef.current
        const cur = el?.value ?? input
        const at = el?.selectionStart ?? cur.length
        const next = cur.slice(0, at) + key + cur.slice(at)
        setInputValue(next, at + 1)
        break
      }
    }
  }

  const saveEditor = (content: string) => {
    if (editor) {
      shell.writeFile(editor.path, content)
      setBlocks((prev) => [
        ...prev,
        {
          kind: 'output',
          lines: [[{ text: `[ Wrote ${editor.path} ]`, color: 'dim' }]],
        },
      ])
    }
    setEditor(null)
    setTimeout(focusInput, 0)
  }

  return (
    <div className="flex h-full flex-col bg-term-bg text-term-fg">
      <div
        ref={scrollRef}
        onClick={focusInput}
        className="flex-1 overflow-y-auto px-3 py-2 leading-relaxed"
        style={{ fontSize: `${fontSize}px` }}
      >
        {blocks.map((block, bi) =>
          block.kind === 'output' ? (
            <div key={bi}>{block.lines.map((l, li) => renderLine(l, li))}</div>
          ) : (
            <div key={bi} className="whitespace-pre-wrap break-words">
              <Prompt data={block.prompt} />
              <span className="text-term-fg">{block.command}</span>
            </div>
          ),
        )}

        <div className="whitespace-pre-wrap break-words">
          <Prompt data={prompt} />
          <span className="text-term-fg">{input.slice(0, cursorPos)}</span>
          <span className="animate-pulse bg-term-fg text-term-bg">
            {input[cursorPos] ?? ' '}
          </span>
          <span className="text-term-fg">{input.slice(cursorPos + 1)}</span>
        </div>

        <div ref={bottomRef} />
      </div>

      <input
        ref={inputRef}
        defaultValue=""
        onChange={(e) => {
          setInput(e.target.value)
          setCursorPos(e.target.selectionStart ?? e.target.value.length)
        }}
        onSelect={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyDown={handleKeyDown}
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Terminal command input"
        className="absolute h-0 w-0 opacity-0"
      />

      <ExtraKeys onKey={handleSpecialKey} ctrlActive={ctrl} altActive={alt} onMenu={onMenu} />

      {editor && (
        <NanoEditor
          path={editor.path}
          initialContent={editor.content}
          fontSize={fontSize}
          onSave={saveEditor}
          onExit={() => {
            setEditor(null)
            setTimeout(focusInput, 0)
          }}
        />
      )}
    </div>
  )
}
