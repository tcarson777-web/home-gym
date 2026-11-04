import { FIGURES, type Limb, type Pose, type Pt } from '../lib/figures'

function PoseSvg({ pose, size }: { pose: Pose; size: number }) {
  const line = (a: Pt, b: Pt, faded: boolean, key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} opacity={faded ? 0.4 : 1} />
  )
  const limb = (from: Pt, [joint, end]: Limb, i: number, kind: string) => {
    const faded = !pose.front && i > 0
    return [line(from, joint, faded, `${kind}${i}a`), line(joint, end, faded, `${kind}${i}b`)]
  }
  const spine = pose.spine
    ? `M${pose.neck[0]},${pose.neck[1]} Q${pose.spine[0]},${pose.spine[1]} ${pose.hip[0]},${pose.hip[1]}`
    : `M${pose.neck[0]},${pose.neck[1]} L${pose.hip[0]},${pose.hip[1]}`
  return (
    <svg viewBox="0 0 80 64" width={size} height={(size * 64) / 80} aria-hidden="true" className="figure">
      {!pose.noGround && <line x1="2" y1="61" x2="78" y2="61" className="figure-ground" />}
      {pose.wall != null && <line x1={pose.wall} y1="20" x2={pose.wall} y2="61" className="figure-ground" />}
      {pose.bar != null && <line x1="22" y1={pose.bar} x2="58" y2={pose.bar} className="figure-ground" />}
      {pose.band && <line x1={pose.band[0][0]} y1={pose.band[0][1]} x2={pose.band[1][0]} y2={pose.band[1][1]} className="figure-band" />}
      <g className="figure-body">
        {/* far limbs first so near limbs draw on top */}
        {pose.legs.slice(1).flatMap((l, i) => limb(pose.hip, l, i + 1, 'l'))}
        {pose.arms.slice(1).flatMap((l, i) => limb(pose.neck, l, i + 1, 'a'))}
        <path d={spine} fill="none" />
        {limb(pose.hip, pose.legs[0], 0, 'l')}
        {limb(pose.neck, pose.arms[0], 0, 'a')}
        <circle cx={pose.head[0]} cy={pose.head[1]} r="4.2" className="figure-head" />
      </g>
    </svg>
  )
}

/** All frames of a move, left to right with arrows between them. Nothing if there's no drawing. */
export default function Figure({ exerciseId, size = 72, first = false }: { exerciseId: string; size?: number; first?: boolean }) {
  const all = FIGURES[exerciseId]
  if (!all) return null
  const frames = first ? all.slice(0, 1) : all
  return (
    <span className="figure-strip">
      {frames.map((f, i) => (
        <span key={i} className="figure-frame">
          {i > 0 && <span className="figure-arrow">›</span>}
          <PoseSvg pose={f} size={size} />
        </span>
      ))}
    </span>
  )
}

export const hasFigure = (exerciseId: string) => exerciseId in FIGURES
