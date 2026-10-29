interface Props {
  value: number | undefined
  unit: string
  onDown: () => void
  onUp: () => void
  placeholder?: string
}

export default function Stepper({ value, unit, onDown, onUp, placeholder = '—' }: Props) {
  return (
    <div className="stepper">
      <button aria-label={`less ${unit}`} onClick={onDown}>−</button>
      <div className="value">
        {value ?? placeholder} <span className="unit">{unit}</span>
      </div>
      <button aria-label={`more ${unit}`} onClick={onUp}>+</button>
    </div>
  )
}
