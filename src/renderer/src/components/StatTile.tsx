interface Props {
  label: string
  value: number | string
}

export function StatTile({ label, value }: Props): React.JSX.Element {
  return (
    <div className="w-[150px] rounded-[10px] bg-white/10 p-[18px]">
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-[13px] text-ink-faint">{label}</div>
    </div>
  )
}
