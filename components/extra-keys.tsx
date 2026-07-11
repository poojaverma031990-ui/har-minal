'use client'

import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export type SpecialKey =
  | 'ESC'
  | 'CTRL'
  | 'ALT'
  | 'TAB'
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'HOME'
  | 'END'
  | 'PGUP'
  | 'PGDN'
  | '/'
  | '-'

type Props = {
  onKey: (key: SpecialKey) => void
  ctrlActive: boolean
  altActive: boolean
  onMenu?: () => void
}

function Key({
  onPress,
  children,
  active,
  ariaLabel,
}: {
  onPress: () => void
  children: ReactNode
  active?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      className={`flex h-9 flex-1 items-center justify-center rounded-md border border-white/5 text-xs font-medium uppercase tracking-wide transition-colors select-none ${
        active
          ? 'bg-term-key-active text-term-green'
          : 'bg-term-key text-term-fg/80 active:bg-term-key-active'
      }`}
    >
      {children}
    </button>
  )
}

export function ExtraKeys({ onKey, ctrlActive, altActive }: Props) {
  return (
    <div className="flex flex-col gap-1 border-t border-white/10 bg-black px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-1">
        <Key onPress={() => onKey('ESC')} ariaLabel="Escape">
          esc
        </Key>
        <Key onPress={() => onKey('/')} ariaLabel="Slash">
          /
        </Key>
        <Key onPress={() => onKey('-')} ariaLabel="Dash">
          -
        </Key>
        <Key onPress={() => onKey('HOME')} ariaLabel="Home">
          home
        </Key>
        <Key onPress={() => onKey('UP')} ariaLabel="Up arrow">
          <ArrowUp className="h-4 w-4" />
        </Key>
        <Key onPress={() => onKey('END')} ariaLabel="End">
          end
        </Key>
        <Key onPress={() => onKey('PGUP')} ariaLabel="Page up">
          pgup
        </Key>
      </div>
      <div className="flex gap-1">
        <Key onPress={() => onKey('TAB')} ariaLabel="Tab">
          tab
        </Key>
        <Key onPress={() => onKey('CTRL')} active={ctrlActive} ariaLabel="Control">
          ctrl
        </Key>
        <Key onPress={() => onKey('ALT')} active={altActive} ariaLabel="Alt">
          alt
        </Key>
        <Key onPress={() => onKey('LEFT')} ariaLabel="Left arrow">
          <ArrowLeft className="h-4 w-4" />
        </Key>
        <Key onPress={() => onKey('DOWN')} ariaLabel="Down arrow">
          <ArrowDown className="h-4 w-4" />
        </Key>
        <Key onPress={() => onKey('RIGHT')} ariaLabel="Right arrow">
          <ArrowRight className="h-4 w-4" />
        </Key>
        <Key onPress={() => onKey('PGDN')} ariaLabel="Page down">
          pgdn
        </Key>
      </div>
    </div>
  )
}
