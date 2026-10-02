import { GraduationCap, Home, MessageCircle, Settings, TrendingDown, Upload } from 'lucide-react'
import { NavLink } from 'react-router'

const destinations = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/review', label: 'Review', icon: GraduationCap, end: false },
  { to: '/chat', label: 'Chat', icon: MessageCircle, end: false },
  { to: '/weak', label: 'Weak', icon: TrendingDown, end: false },
  { to: '/import', label: 'Import', icon: Upload, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false }
]

export function Sidebar(): React.JSX.Element {
  return (
    <nav
      aria-label="Main"
      className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-white/10 py-4"
    >
      {destinations.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-xs transition ${
              isActive ? 'bg-white/10 text-ink' : 'text-ink-faint hover:text-ink'
            }`
          }
        >
          <Icon size={20} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
