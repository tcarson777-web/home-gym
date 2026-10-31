import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, getProfile } from '../lib/db'
import { describeEquipment, KIND_INFO, parseList } from '../lib/equipment'
import type { Equipment, EquipmentKind, PlatePair } from '../lib/types'
import { equipmentUsage, type Usage } from '../lib/usage'

const COMMON_PLATES = [45, 35, 25, 10, 5, 2.5]

function defaults(kind: EquipmentKind): Equipment {
  const base: Equipment = { kind, name: KIND_INFO[kind].label }
  if (kind === 'adjustable_dumbbells') return { ...base, minWeight: 5, maxWeight: 52.5, increment: 2.5 }
  if (kind === 'barbell') return { ...base, barWeight: 45 }
  if (kind === 'plates') return { ...base, plates: [{ weight: 45, pairs: 2 }, { weight: 25, pairs: 1 }, { weight: 10, pairs: 1 }, { weight: 5, pairs: 1 }, { weight: 2.5, pairs: 1 }] }
  return base
}

export default function EquipmentScreen() {
  const items = useLiveQuery(() => db.equipment.toArray(), [], [])
  const usage = useLiveQuery(async () => equipmentUsage(await db.equipment.toArray(), await getProfile()), [], new Map<number, Usage>())
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [picking, setPicking] = useState(false)

  if (editing) return <EquipmentForm initial={editing} onDone={() => setEditing(null)} />

  if (picking) {
    return (
      <div className="stack">
        <div className="row between">
          <h1>Add equipment</h1>
          <button className="btn ghost sm" onClick={() => setPicking(false)}>Cancel</button>
        </div>
        <div className="kind-grid">
          {(Object.keys(KIND_INFO) as EquipmentKind[]).map((k) => (
            <button key={k} onClick={() => { setPicking(false); setEditing(defaults(k)) }}>
              <span style={{ fontSize: '1.5rem' }}>{KIND_INFO[k].emoji}</span>
              <span>{KIND_INFO[k].label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div>
        <h1>My garage</h1>
        <p className="muted small">Workouts only use what's listed here. Tap an item to edit it.</p>
      </div>
      {items.length === 0 && <div className="card muted">Nothing yet. Add your dumbbells, barbell, plates, bench and anything else you have.</div>}
      {items.map((e) => (
        <button key={e.id} className="card row" style={{ textAlign: 'left' }} onClick={() => setEditing(e)}>
          <span style={{ fontSize: '1.6rem' }}>{KIND_INFO[e.kind].emoji}</span>
          <div className="grow">
            <h3>{e.name}</h3>
            <p className="muted small">{describeEquipment(e)}</p>
            <UsageLine usage={usage.get(e.id!)} />
          </div>
          <span className="muted">›</span>
        </button>
      ))}
      <button className="btn primary big" onClick={() => setPicking(true)}>+ Add equipment</button>
    </div>
  )
}

function UsageLine({ usage }: { usage: Usage | undefined }) {
  if (!usage) return null
  if (usage.warning) return <p className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>⚠️ {usage.warning}</p>
  return (
    <div className="small" style={{ marginTop: 4 }}>
      {usage.inPlans.length > 0 ? (
        <p style={{ color: 'var(--good)' }}>✓ In your workouts: {usage.inPlans.join(', ')}</p>
      ) : (
        <p className="muted">Not in your current workouts — kept as a backup option.</p>
      )}
      {usage.alternatives.length > 0 && <p className="muted">Also unlocks: {usage.alternatives.join(', ')}</p>}
    </div>
  )
}

function NumberField({ label, value, onChange, step = 'any' }: { label: string; value?: number; onChange: (v?: number) => void; step?: string }) {
  return (
    <label className="field">
      {label}
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
      />
    </label>
  )
}

function EquipmentForm({ initial, onDone }: { initial: Equipment; onDone: () => void }) {
  const [e, setE] = useState<Equipment>(initial)
  const [listText, setListText] = useState((initial.weights ?? []).join(', '))
  const [bandText, setBandText] = useState((initial.bandLevels ?? []).join(', '))
  const set = (patch: Partial<Equipment>) => setE((prev) => ({ ...prev, ...patch }))
  const plates = e.plates ?? []
  const setPlates = (p: PlatePair[]) => set({ plates: p.filter((x) => x.weight > 0).sort((a, b) => b.weight - a.weight) })

  async function save() {
    const item: Equipment = { ...e }
    if (e.kind === 'fixed_dumbbells' || e.kind === 'kettlebells') item.weights = parseList(listText)
    if (e.kind === 'bands') item.bandLevels = bandText.split(',').map((s) => s.trim()).filter(Boolean)
    if (e.kind === 'plates') item.plates = plates.filter((p) => p.pairs > 0)
    await db.equipment.put(item)
    onDone()
  }

  async function remove() {
    if (e.id != null && confirm(`Remove ${e.name}?`)) {
      await db.equipment.delete(e.id)
      onDone()
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <h1>{KIND_INFO[e.kind].emoji} {e.id ? 'Edit' : 'Add'}</h1>
        <button className="btn ghost sm" onClick={onDone}>Cancel</button>
      </div>

      <label className="field">
        Type
        <select
          className="input"
          value={e.kind}
          onChange={(ev) => {
            const kind = ev.target.value as EquipmentKind
            // Fill in sensible defaults for the new type, but keep the name and notes.
            setE({ ...defaults(kind), id: e.id, name: e.name || KIND_INFO[kind].label, notes: e.notes })
          }}
        >
          {(Object.keys(KIND_INFO) as EquipmentKind[]).map((k) => (
            <option key={k} value={k}>{KIND_INFO[k].emoji} {KIND_INFO[k].label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        Name
        <input className="input" value={e.name} onChange={(ev) => set({ name: ev.target.value })} />
      </label>

      {e.kind === 'adjustable_dumbbells' && (
        <>
          <div className="row">
            <div className="grow"><NumberField label="Lightest (lb)" value={e.minWeight} onChange={(v) => set({ minWeight: v })} /></div>
            <div className="grow"><NumberField label="Heaviest (lb)" value={e.maxWeight} onChange={(v) => set({ maxWeight: v })} /></div>
          </div>
          <NumberField label="Smallest jump between settings (lb)" value={e.increment} onChange={(v) => set({ increment: v })} />
          <p className="muted small">If your dumbbells have uneven jumps, use "Fixed dumbbells" instead and list every setting.</p>
        </>
      )}

      {(e.kind === 'fixed_dumbbells' || e.kind === 'kettlebells') && (
        <label className="field">
          Weights you own (lb), separated by commas{e.kind === 'fixed_dumbbells' ? ' — one entry per pair' : ''}
          <input className="input" placeholder="e.g. 10, 15, 20, 25  or  5-50" value={listText} onChange={(ev) => setListText(ev.target.value)} />
          {parseList(listText).length > 0 ? (
            <span className="small">Will save: {parseList(listText).join(', ')} lb</span>
          ) : (
            <span className="small" style={{ color: 'var(--warn)' }}>No weights yet — workouts can't use these until you add some.</span>
          )}
        </label>
      )}

      {e.kind === 'barbell' && <NumberField label="Bar weight (lb)" value={e.barWeight} onChange={(v) => set({ barWeight: v })} />}

      {e.kind === 'plates' && (
        <div className="stack">
          <p className="muted small">How many <b>pairs</b> of each plate do you have? (A pair = one for each side.)</p>
          {plates.map((p, i) => (
            <div key={i} className="row">
              <div className="grow"><b>{p.weight} lb</b></div>
              <button className="btn sm" onClick={() => setPlates(plates.map((x, j) => (j === i ? { ...x, pairs: Math.max(0, x.pairs - 1) } : x)))}>−</button>
              <span style={{ minWidth: 60, textAlign: 'center' }}>{p.pairs} pair{p.pairs === 1 ? '' : 's'}</span>
              <button className="btn sm" onClick={() => setPlates(plates.map((x, j) => (j === i ? { ...x, pairs: x.pairs + 1 } : x)))}>+</button>
            </div>
          ))}
          <div className="row wrap">
            {COMMON_PLATES.filter((w) => !plates.some((p) => p.weight === w)).map((w) => (
              <button key={w} className="btn sm" onClick={() => setPlates([...plates, { weight: w, pairs: 1 }])}>+ {w} lb</button>
            ))}
            <button
              className="btn sm"
              onClick={() => {
                const w = parseFloat(prompt('Plate weight in lb') ?? '')
                if (w > 0) setPlates([...plates, { weight: w, pairs: 1 }])
              }}
            >
              + other
            </button>
          </div>
        </div>
      )}

      {e.kind === 'bench' && (
        <label className="row" style={{ minHeight: 48 }}>
          <input type="checkbox" style={{ width: 24, height: 24 }} checked={!!e.incline} onChange={(ev) => set({ incline: ev.target.checked })} />
          Adjustable (can incline)
        </label>
      )}

      {e.kind === 'bands' && (
        <label className="field">
          Band strengths you have, separated by commas
          <input className="input" placeholder="e.g. light, medium, heavy" value={bandText} onChange={(ev) => setBandText(ev.target.value)} />
        </label>
      )}

      <label className="field">
        Notes (optional)
        <textarea className="input" value={e.notes ?? ''} onChange={(ev) => set({ notes: ev.target.value })} placeholder="Anything the coach should know" />
      </label>

      <button className="btn primary big" onClick={save}>Save</button>
      {e.id != null && <button className="btn danger" onClick={remove}>Remove</button>}
    </div>
  )
}
