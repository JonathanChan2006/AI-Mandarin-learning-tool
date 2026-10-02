type Variant = 'filled' | 'outlined' | 'ghost'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

const styles: Record<Variant, string> = {
  filled: 'bg-primary text-black hover:bg-primary/90',
  outlined: 'border border-white/25 text-ink hover:bg-white/10',
  ghost: 'text-ink-muted hover:bg-white/10'
}

export function Button({
  variant = 'filled',
  className = '',
  type = 'button',
  ...rest
}: Props): React.JSX.Element {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    />
  )
}
