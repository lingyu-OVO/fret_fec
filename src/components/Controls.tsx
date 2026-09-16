import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; group?: string }[]
  ariaLabel?: string
}) {
  const groups = new Map<string, { value: T; label: string }[]>()
  for (const o of options) {
    const g = o.group ?? ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(o)
  }

  return (
    <select className="select" value={String(value)} onChange={(e) => {
      const raw = e.target.value
      const hit = options.find((o) => String(o.value) === raw)
      if (hit) onChange(hit.value)
    }} aria-label={ariaLabel}>
      {[...groups.entries()].map(([g, items]) =>
        g ? (
          <optgroup key={g} label={g}>
            {items.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          items.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; title?: string }[]
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`segmented-item${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
          title={o.title}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  title?: string
}) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      title={title}
    >
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
      <span className="switch-label">{label}</span>
    </button>
  )
}

export function Chip({
  active,
  onClick,
  children,
  title,
  tone = 'default',
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
  tone?: 'default' | 'accent'
}) {
  return (
    <button
      type="button"
      className={`chip chip-${tone}${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

export function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
