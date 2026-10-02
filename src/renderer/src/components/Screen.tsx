interface Props {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function Screen({ title, subtitle, actions, children }: Props): React.JSX.Element {
  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
