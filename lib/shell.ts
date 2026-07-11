// har.minal shell engine — a simulated POSIX-ish shell with a virtual filesystem.
// Everything runs client-side in the browser.

export type FileNode = {
  type: 'file'
  content: string
}

export type DirNode = {
  type: 'dir'
  children: Record<string, Node>
}

export type Node = FileNode | DirNode

export type Segment = {
  text: string
  color?: 'fg' | 'green' | 'blue' | 'yellow' | 'red' | 'dim'
  bold?: boolean
}

export type Line = Segment[]

export type ExecResult = {
  lines: Line[]
  clear?: boolean
  exit?: boolean
}

export const USER = 'harsh'
export const HOST = 'localhost'

const now = () => new Date()

function makeFs(): DirNode {
  return {
    type: 'dir',
    children: {
      'data': {
        type: 'dir',
        children: {
          'data': {
            type: 'dir',
            children: {
              'com.harminal': {
                type: 'dir',
                children: {
                  'files': {
                    type: 'dir',
                    children: {
                      'home': {
                        type: 'dir',
                        children: {
                          'storage': { type: 'dir', children: {} },
                          '.bashrc': {
                            type: 'file',
                            content:
                              '# ~/.bashrc — har.minal\nexport PS1="\\u@\\h \\w $ "\nalias ll="ls -la"\nalias la="ls -a"\n',
                          },
                          'README.md': {
                            type: 'file',
                            content:
                              '# Welcome to har.minal\n\nYour own terminal for Android.\n\nType `help` to see available commands.\nType `pkg install <name>` to simulate installing a package.\n',
                          },
                          'projects': {
                            type: 'dir',
                            children: {
                              'hello.sh': {
                                type: 'file',
                                content: '#!/data/data/com.harminal/files/usr/bin/bash\necho "Hello from har.minal!"\n',
                              },
                            },
                          },
                        },
                      },
                      'usr': {
                        type: 'dir',
                        children: {
                          'bin': { type: 'dir', children: {} },
                          'etc': { type: 'dir', children: {} },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

export const HOME = '/data/data/com.harminal/files/home'

export class Shell {
  fs: DirNode
  cwd: string
  env: Record<string, string>
  history: string[]
  installed: Set<string>

  constructor() {
    this.fs = makeFs()
    this.cwd = HOME
    this.env = {
      USER,
      HOME,
      SHELL: '/data/data/com.harminal/files/usr/bin/bash',
      PATH: '/data/data/com.harminal/files/usr/bin',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      PREFIX: '/data/data/com.harminal/files/usr',
    }
    this.history = []
    this.installed = new Set(['bash', 'coreutils', 'busybox'])
  }

  // ----- path helpers -----
  resolve(path: string): string {
    if (!path) return this.cwd
    let base: string[]
    if (path.startsWith('/')) base = []
    else if (path.startsWith('~')) {
      base = HOME.split('/').filter(Boolean)
      path = path.slice(1)
    } else base = this.cwd.split('/').filter(Boolean)

    for (const part of path.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') base.pop()
      else base.push(part)
    }
    return '/' + base.join('/')
  }

  getNode(path: string): Node | null {
    const abs = this.resolve(path)
    if (abs === '/') return this.fs
    let node: Node = this.fs
    for (const part of abs.split('/').filter(Boolean)) {
      if (node.type !== 'dir' || !node.children[part]) return null
      node = node.children[part]
    }
    return node
  }

  getParent(path: string): { parent: DirNode; name: string } | null {
    const abs = this.resolve(path)
    const parts = abs.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) return null
    const parentPath = '/' + parts.join('/')
    const parent = this.getNode(parentPath)
    if (!parent || parent.type !== 'dir') return null
    return { parent, name }
  }

  shortCwd(): string {
    if (this.cwd === HOME) return '~'
    if (this.cwd.startsWith(HOME + '/')) return '~' + this.cwd.slice(HOME.length)
    return this.cwd
  }

  // ----- executor -----
  exec(raw: string): ExecResult {
    const input = raw.trim()
    if (input) this.history.push(input)
    if (!input) return { lines: [] }

    // support multiple commands separated by ; (very simple)
    const commands = input.split(/\s*;\s*/).filter(Boolean)
    let out: Line[] = []
    let clear = false
    let exit = false
    for (const cmd of commands) {
      const r = this.runOne(cmd)
      if (r.clear) {
        clear = true
        out = []
      }
      out = out.concat(r.lines)
      if (r.exit) exit = true
    }
    return { lines: out, clear, exit }
  }

  private runOne(cmd: string): ExecResult {
    const tokens = this.tokenize(cmd)
    if (tokens.length === 0) return { lines: [] }
    const name = tokens[0]
    const args = tokens.slice(1)
    const fn = (this.commands as Record<string, (a: string[]) => ExecResult>)[name]
    if (fn) return fn.call(this, args)
    // alias
    if (name === 'll') return this.commands.ls.call(this, ['-la', ...args])
    if (name === 'la') return this.commands.ls.call(this, ['-a', ...args])
    return {
      lines: [
        [
          { text: 'bash: ', color: 'fg' },
          { text: name, color: 'fg' },
          { text: ': command not found', color: 'fg' },
        ],
      ],
    }
  }

  private tokenize(cmd: string): string[] {
    const out: string[] = []
    let cur = ''
    let quote: string | null = null
    for (const ch of cmd.trim()) {
      if (quote) {
        if (ch === quote) quote = null
        else cur += ch
      } else if (ch === '"' || ch === "'") quote = ch
      else if (ch === ' ') {
        if (cur) out.push(cur)
        cur = ''
      } else cur += ch
    }
    if (cur) out.push(cur)
    return out
  }

  private text(s: string, color?: Segment['color'], bold?: boolean): Line {
    return [{ text: s, color, bold }]
  }

  private lines(arr: string[], color?: Segment['color']): Line[] {
    return arr.map((s) => [{ text: s, color }] as Line)
  }

  commands: Record<string, (args: string[]) => ExecResult> = {
    help: () => ({
      lines: [
        this.text('har.minal — available commands', 'green', true),
        this.text(''),
        ...this.lines([
          'File system : ls  cd  pwd  cat  mkdir  touch  rm  cp  mv  tree  echo',
          'Text        : head  tail  grep  wc  clear',
          'System      : whoami  hostname  uname  id  date  uptime  env  export',
          'Packages    : pkg  apt  pip',
          'Fun         : neofetch  banner  fortune  cowsay  history  help  exit',
        ]),
        this.text(''),
        this.text('Tip: use the extra-keys row for ESC, CTRL, TAB and arrows.', 'dim'),
      ],
    }),

    clear: () => ({ lines: [], clear: true }),

    exit: () => ({
      lines: [this.text('logout', 'dim')],
      exit: true,
    }),

    pwd: () => ({ lines: [this.text(this.cwd)] }),

    whoami: () => ({ lines: [this.text(USER)] }),

    hostname: () => ({ lines: [this.text(HOST)] }),

    id: () => ({
      lines: [this.text(`uid=10123(${USER}) gid=10123(${USER}) groups=10123(${USER})`)],
    }),

    date: () => ({ lines: [this.text(now().toString())] }),

    uptime: () => {
      const mins = Math.floor((Date.now() % (1000 * 60 * 60 * 5)) / 60000)
      return {
        lines: [
          this.text(
            `${now().toLocaleTimeString()}  up ${mins} min,  1 user,  load average: 0.08, 0.12, 0.09`,
          ),
        ],
      }
    },

    uname: (args) => {
      if (args.includes('-a'))
        return {
          lines: [
            this.text(
              'Linux localhost 5.10.0-harminal aarch64 #1 SMP PREEMPT Android GNU/Linux',
            ),
          ],
        }
      return { lines: [this.text('Linux')] }
    },

    echo: (args) => ({ lines: [this.text(args.join(' '))] }),

    env: () => ({
      lines: Object.entries(this.env).map(([k, v]) => this.text(`${k}=${v}`)),
    }),

    export: (args) => {
      for (const a of args) {
        const [k, ...rest] = a.split('=')
        if (k && rest.length) this.env[k] = rest.join('=')
      }
      return { lines: [] }
    },

    history: () => ({
      lines: this.history.map((h, i) =>
        [
          { text: `${String(i + 1).padStart(4)}  `, color: 'dim' } as Segment,
          { text: h },
        ] as Line,
      ),
    }),

    ls: (args) => {
      const flags = args.filter((a) => a.startsWith('-')).join('')
      const showAll = flags.includes('a')
      const long = flags.includes('l')
      const targets = args.filter((a) => !a.startsWith('-'))
      const path = targets[0] ?? '.'
      const node = this.getNode(path)
      if (!node)
        return {
          lines: [this.text(`ls: cannot access '${path}': No such file or directory`, 'red')],
        }
      if (node.type === 'file') return { lines: [this.text(path)] }
      let names = Object.keys(node.children)
      if (!showAll) names = names.filter((n) => !n.startsWith('.'))
      names.sort()
      if (names.length === 0) return { lines: [] }
      if (long) {
        const lines: Line[] = names.map((n) => {
          const child = node.children[n]
          const isDir = child.type === 'dir'
          const size = isDir ? 4096 : (child as FileNode).content.length
          return [
            { text: isDir ? 'drwx------ ' : '-rw------- ', color: 'dim' } as Segment,
            { text: `${USER} ${USER} `, color: 'dim' } as Segment,
            { text: `${String(size).padStart(6)} `, color: 'dim' } as Segment,
            { text: 'Jul 11 12:00 ', color: 'dim' } as Segment,
            { text: n, color: isDir ? 'blue' : 'fg', bold: isDir },
          ]
        })
        return { lines }
      }
      // grid-ish single line, dirs blue
      const segs: Segment[] = []
      names.forEach((n, i) => {
        const isDir = node.children[n].type === 'dir'
        segs.push({ text: n, color: isDir ? 'blue' : 'fg', bold: isDir })
        if (i < names.length - 1) segs.push({ text: '  ', color: 'fg' })
      })
      return { lines: [segs] }
    },

    cd: (args) => {
      const target = args[0] ?? HOME
      const node = this.getNode(target)
      if (!node) return { lines: [this.text(`cd: ${target}: No such file or directory`, 'red')] }
      if (node.type !== 'dir') return { lines: [this.text(`cd: ${target}: Not a directory`, 'red')] }
      this.cwd = this.resolve(target)
      return { lines: [] }
    },

    cat: (args) => {
      if (args.length === 0) return { lines: [] }
      const out: Line[] = []
      for (const p of args) {
        const node = this.getNode(p)
        if (!node) out.push(this.text(`cat: ${p}: No such file or directory`, 'red'))
        else if (node.type === 'dir') out.push(this.text(`cat: ${p}: Is a directory`, 'red'))
        else
          for (const l of node.content.replace(/\n$/, '').split('\n')) out.push(this.text(l))
      }
      return { lines: out }
    },

    head: (args) => {
      const p = args.find((a) => !a.startsWith('-'))
      if (!p) return { lines: [] }
      const node = this.getNode(p)
      if (!node || node.type !== 'file')
        return { lines: [this.text(`head: cannot open '${p}'`, 'red')] }
      return { lines: node.content.split('\n').slice(0, 10).map((l) => this.text(l)) }
    },

    tail: (args) => {
      const p = args.find((a) => !a.startsWith('-'))
      if (!p) return { lines: [] }
      const node = this.getNode(p)
      if (!node || node.type !== 'file')
        return { lines: [this.text(`tail: cannot open '${p}'`, 'red')] }
      return { lines: node.content.split('\n').slice(-10).map((l) => this.text(l)) }
    },

    wc: (args) => {
      const p = args.find((a) => !a.startsWith('-'))
      if (!p) return { lines: [] }
      const node = this.getNode(p)
      if (!node || node.type !== 'file')
        return { lines: [this.text(`wc: ${p}: No such file`, 'red')] }
      const lines = node.content.split('\n').length
      const words = node.content.split(/\s+/).filter(Boolean).length
      const chars = node.content.length
      return { lines: [this.text(`${lines} ${words} ${chars} ${p}`)] }
    },

    grep: (args) => {
      if (args.length < 2) return { lines: [this.text('usage: grep PATTERN FILE', 'red')] }
      const [pattern, ...files] = args
      const out: Line[] = []
      for (const f of files) {
        const node = this.getNode(f)
        if (!node || node.type !== 'file') continue
        for (const line of node.content.split('\n')) {
          if (line.includes(pattern)) {
            const idx = line.indexOf(pattern)
            out.push([
              { text: line.slice(0, idx) },
              { text: pattern, color: 'red', bold: true },
              { text: line.slice(idx + pattern.length) },
            ])
          }
        }
      }
      return { lines: out }
    },

    mkdir: (args) => {
      for (const p of args.filter((a) => !a.startsWith('-'))) {
        const info = this.getParent(p)
        if (!info) {
          return { lines: [this.text(`mkdir: cannot create directory '${p}'`, 'red')] }
        }
        if (info.parent.children[info.name])
          return { lines: [this.text(`mkdir: cannot create directory '${p}': File exists`, 'red')] }
        info.parent.children[info.name] = { type: 'dir', children: {} }
      }
      return { lines: [] }
    },

    touch: (args) => {
      for (const p of args) {
        const info = this.getParent(p)
        if (!info) return { lines: [this.text(`touch: cannot touch '${p}'`, 'red')] }
        if (!info.parent.children[info.name])
          info.parent.children[info.name] = { type: 'file', content: '' }
      }
      return { lines: [] }
    },

    rm: (args) => {
      const recursive = args.some((a) => a.startsWith('-') && a.includes('r'))
      for (const p of args.filter((a) => !a.startsWith('-'))) {
        const info = this.getParent(p)
        if (!info || !info.parent.children[info.name])
          return { lines: [this.text(`rm: cannot remove '${p}': No such file or directory`, 'red')] }
        const node = info.parent.children[info.name]
        if (node.type === 'dir' && !recursive)
          return { lines: [this.text(`rm: cannot remove '${p}': Is a directory`, 'red')] }
        delete info.parent.children[info.name]
      }
      return { lines: [] }
    },

    cp: (args) => {
      const paths = args.filter((a) => !a.startsWith('-'))
      if (paths.length < 2) return { lines: [this.text('usage: cp SRC DEST', 'red')] }
      const src = this.getNode(paths[0])
      if (!src) return { lines: [this.text(`cp: cannot stat '${paths[0]}'`, 'red')] }
      const info = this.getParent(paths[1])
      if (!info) return { lines: [this.text(`cp: cannot create '${paths[1]}'`, 'red')] }
      info.parent.children[info.name] = JSON.parse(JSON.stringify(src))
      return { lines: [] }
    },

    mv: (args) => {
      const paths = args.filter((a) => !a.startsWith('-'))
      if (paths.length < 2) return { lines: [this.text('usage: mv SRC DEST', 'red')] }
      const info1 = this.getParent(paths[0])
      if (!info1 || !info1.parent.children[info1.name])
        return { lines: [this.text(`mv: cannot stat '${paths[0]}'`, 'red')] }
      const node = info1.parent.children[info1.name]
      const info2 = this.getParent(paths[1])
      if (!info2) return { lines: [this.text(`mv: cannot move to '${paths[1]}'`, 'red')] }
      info2.parent.children[info2.name] = node
      delete info1.parent.children[info1.name]
      return { lines: [] }
    },

    tree: (args) => {
      const start = args[0] ?? '.'
      const node = this.getNode(start)
      if (!node || node.type !== 'dir')
        return { lines: [this.text(`tree: ${start}: not a directory`, 'red')] }
      const out: Line[] = [this.text(start === '.' ? this.shortCwd() : start, 'blue', true)]
      const walk = (dir: DirNode, prefix: string) => {
        const entries = Object.keys(dir.children).sort()
        entries.forEach((name, i) => {
          const last = i === entries.length - 1
          const child = dir.children[name]
          const isDir = child.type === 'dir'
          out.push([
            { text: prefix + (last ? '└── ' : '├── '), color: 'dim' },
            { text: name, color: isDir ? 'blue' : 'fg', bold: isDir },
          ])
          if (isDir) walk(child, prefix + (last ? '    ' : '│   '))
        })
      }
      walk(node, '')
      return { lines: out }
    },

    pkg: (args) => this.pkgManager(args),
    apt: (args) => this.pkgManager(args),

    pip: (args) => {
      const sub = args[0]
      const name = args[1]
      if (sub === 'install' && name)
        return {
          lines: [
            this.text(`Collecting ${name}`),
            this.text(`  Downloading ${name}-1.0.0-py3-none-any.whl (42 kB)`),
            this.text(`Installing collected packages: ${name}`),
            this.text(`Successfully installed ${name}-1.0.0`, 'green'),
          ],
        }
      return { lines: [this.text('usage: pip install <package>', 'yellow')] }
    },

    fortune: () => {
      const quotes = [
        'The best way to predict the future is to invent it.',
        'Talk is cheap. Show me the code.',
        'Programs must be written for people to read.',
        'Simplicity is the soul of efficiency.',
        'First, solve the problem. Then, write the code.',
      ]
      return { lines: [this.text(quotes[Math.floor(Math.random() * quotes.length)], 'yellow')] }
    },

    cowsay: (args) => {
      const msg = args.join(' ') || 'moo'
      const top = ' ' + '_'.repeat(msg.length + 2)
      const bottom = ' ' + '-'.repeat(msg.length + 2)
      return {
        lines: [
          this.text(top),
          this.text(`< ${msg} >`),
          this.text(bottom),
          this.text('        \\   ^__^'),
          this.text('         \\  (oo)\\_______'),
          this.text('            (__)\\       )\\/\\'),
          this.text('                ||----w |'),
          this.text('                ||     ||'),
        ],
      }
    },

    banner: () => ({ lines: bannerLines() }),

    neofetch: () => neofetch(this),
  }

  private pkgManager(args: string[]): ExecResult {
    const sub = args[0]
    const pkgs = args.slice(1).filter((a) => !a.startsWith('-'))
    switch (sub) {
      case 'install': {
        if (pkgs.length === 0) return { lines: [this.text('pkg: no packages specified', 'yellow')] }
        const out: Line[] = []
        for (const p of pkgs) {
          this.installed.add(p)
          out.push(this.text(`Reading package lists... Done`, 'dim'))
          out.push(this.text(`Building dependency tree... Done`, 'dim'))
          out.push(this.text(`The following NEW packages will be installed:`))
          out.push(this.text(`  ${p}`, 'green'))
          out.push(this.text(`Get:1 https://packages.harminal.dev stable ${p} [1,024 kB]`))
          out.push(this.text(`Unpacking ${p}...`))
          out.push(this.text(`Setting up ${p}...`))
          out.push(this.text(`Installed ${p} successfully.`, 'green'))
        }
        return { lines: out }
      }
      case 'uninstall':
      case 'remove': {
        const out: Line[] = []
        for (const p of pkgs) {
          this.installed.delete(p)
          out.push(this.text(`Removing ${p}...`))
          out.push(this.text(`Removed ${p}.`, 'green'))
        }
        return { lines: out }
      }
      case 'list':
      case 'list-installed':
        return {
          lines: [...this.installed].sort().map((p) => this.text(`${p}/stable, installed`, 'green')),
        }
      case 'search': {
        const q = pkgs[0] ?? ''
        const avail = ['python', 'nodejs', 'git', 'vim', 'nano', 'curl', 'wget', 'openssh', 'clang', 'golang', 'ruby', 'php']
        const hits = avail.filter((a) => a.includes(q))
        return { lines: hits.map((h) => this.text(`${h}/stable  ~ ${h} package`, 'green')) }
      }
      case 'update':
        return {
          lines: [
            this.text('Get:1 https://packages.harminal.dev stable InRelease'),
            this.text('Reading package lists... Done'),
            this.text('All packages are up to date.', 'green'),
          ],
        }
      case 'upgrade':
        return {
          lines: [
            this.text('Reading package lists... Done'),
            this.text('Calculating upgrade... Done'),
            this.text('0 upgraded, 0 newly installed, 0 to remove.', 'green'),
          ],
        }
      default:
        return {
          lines: [
            this.text('Usage: pkg <command> [arguments]', 'yellow'),
            this.text('Commands: install  remove  search  list  update  upgrade'),
          ],
        }
    }
  }
}

export function bannerLines(): Line[] {
  const art = [
    '  _                          _             _ ',
    ' | |__   __ _ _ __ _ __ ___ (_)_ __   __ _| |',
    " | '_ \\ / _` | '__| '_ ` _ \\| | '_ \\ / _` | |",
    ' | | | | (_| | |_ | | | | | | | | | | (_| | |',
    ' |_| |_|\\__,_|_(_)|_| |_| |_|_|_| |_|\\__,_|_|',
  ]
  return art.map((l) => [{ text: l, color: 'green', bold: true }] as Line)
}

export function neofetch(shell: Shell): ExecResult {
  const logo = [
    '        #####        ',
    '       #######       ',
    '       ##O#O##       ',
    '       #######       ',
    '     ###########     ',
    '    #############    ',
    '   ###############   ',
    '   ##  #######  ##   ',
    '   ##  #######  ##   ',
    '           ####      ',
  ]
  const info: [string, string][] = [
    ['', ''],
    ['harsh', '@localhost'],
    ['-----', ''],
    ['OS', 'har.minal (Android)'],
    ['Host', 'Web Terminal'],
    ['Kernel', '5.10.0-harminal'],
    ['Shell', 'bash 5.2'],
    ['Packages', String(shell.installed.size)],
    ['Terminal', 'har.minal'],
    ['CPU', 'aarch64 (8) @ 2.4GHz'],
    ['Memory', '1428MiB / 7823MiB'],
  ]
  const lines: Line[] = []
  const rows = Math.max(logo.length, info.length)
  for (let i = 0; i < rows; i++) {
    const l = logo[i] ?? ' '.repeat(21)
    const seg: Segment[] = [{ text: l + '  ', color: 'green', bold: true }]
    const pair = info[i]
    if (pair) {
      if (pair[0] === 'harsh') {
        seg.push({ text: 'harsh', color: 'green', bold: true }, { text: '@localhost' })
      } else if (pair[0] === '-----') {
        seg.push({ text: '-----------------', color: 'dim' })
      } else if (pair[0]) {
        seg.push({ text: pair[0], color: 'yellow', bold: true }, { text: ': ' + pair[1] })
      }
    }
    lines.push(seg)
  }
  return { lines }
}
