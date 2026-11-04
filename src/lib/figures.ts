// Stick-figure drawings for warm-up, yoga, mobility and core moves, so you can see at a
// glance what a pose looks like. Drawn on an 80 × 64 grid, ground at y = 60.
// A move can have several frames (e.g. cat → cow) shown left to right.

export type Pt = [number, number]
export type Limb = [Pt, Pt] // [elbow/knee, hand/foot], drawn from the neck (arms) or hip (legs)

export interface Pose {
  head: Pt
  neck: Pt
  hip: Pt
  spine?: Pt // bend the back through this point (rounded / arched backs)
  arms: Limb[] // first = near side (solid), others = far side (faded) unless front view
  legs: Limb[]
  front?: boolean // facing the viewer: draw all limbs solid
  noGround?: boolean
  bar?: number // pull-up bar at this height
  wall?: number // wall at this x
  band?: [Pt, Pt] // resistance band / strap between two points
}

const mirror = (p: Pose): Pose => {
  const m = ([x, y]: Pt): Pt => [80 - x, y]
  const ml = ([a, b]: Limb): Limb => [m(a), m(b)]
  return { ...p, head: m(p.head), neck: m(p.neck), hip: m(p.hip), spine: p.spine && m(p.spine), arms: p.arms.map(ml), legs: p.legs.map(ml) }
}

// Shared positions
const reachUp: Pose = {
  head: [40, 11], neck: [40, 17], hip: [40, 37],
  arms: [[[45, 10], [50, 3]], [[35, 10], [30, 3]]],
  legs: [[[41, 48], [41, 60]], [[39, 48], [39, 60]]],
}
const forwardFold: Pose = {
  head: [52, 55], neck: [50, 50], hip: [40, 36], spine: [50, 36],
  arms: [[[51, 55], [48, 60]]],
  legs: [[[40, 48], [40, 60]], [[39, 48], [39, 60]]],
}
const highPlank: Pose = {
  head: [60, 41], neck: [54, 44], hip: [32, 51],
  arms: [[[54, 52], [54, 60]]],
  legs: [[[21, 55], [8, 59]]],
}
const downDog: Pose = {
  head: [48, 50], neck: [50, 44], hip: [34, 26],
  arms: [[[55, 52], [60, 60]], [[54, 52], [59, 60]]],
  legs: [[[26, 43], [18, 60]], [[27, 43], [19, 60]]],
}
const tabletop = (spine: Pt, head: Pt): Pose => ({
  head, neck: [50, 42], hip: [24, 48], spine,
  arms: [[[50, 51], [50, 60]], [[48, 51], [48, 60]]],
  legs: [[[24, 60], [10, 60]], [[22, 60], [8, 60]]],
})
const lungeBase = { hip: [38, 48] as Pt, neck: [56, 34] as Pt, head: [61, 31] as Pt, legs: [[[54, 46], [56, 60]], [[26, 56], [10, 60]]] as Limb[] }
const ninetyNinety: Pose = {
  front: true, head: [40, 26], neck: [40, 32], hip: [40, 52],
  arms: [[[32, 44], [28, 58]], [[48, 44], [52, 58]]],
  legs: [[[54, 58], [44, 60]], [[27, 57], [18, 50]]],
}
const deadBugStart: Pose = {
  head: [12, 53], neck: [18, 55], hip: [40, 56],
  arms: [[[19, 46], [20, 37]], [[17, 46], [18, 37]]],
  legs: [[[42, 44], [53, 44]], [[40, 44], [51, 44]]],
}

export const FIGURES: Record<string, Pose[]> = {
  wu_cat_cow: [tabletop([37, 33], [55, 49]), tabletop([37, 51], [56, 36])],
  wu_wgs: [
    { ...lungeBase, arms: [[[55, 47], [52, 60]], [[57, 47], [59, 60]]] },
    { ...lungeBase, arms: [[[57, 24], [58, 14]], [[56, 47], [58, 60]]] },
  ],
  wu_inchworm: [forwardFold, downDog, highPlank],
  wu_glute_bridge: [{
    head: [14, 56], neck: [20, 57], hip: [42, 46],
    arms: [[[28, 59], [36, 59]]],
    legs: [[[54, 42], [58, 60]], [[52, 42], [56, 60]]],
  }],
  wu_bw_squat: [{
    head: [49, 19], neck: [46, 24], hip: [34, 42],
    arms: [[[55, 26], [64, 26]], [[54, 27], [63, 27]]],
    legs: [[[48, 42], [45, 60]], [[47, 43], [43, 60]]],
  }],
  wu_band_pullapart: [{
    front: true, head: [40, 11], neck: [40, 17], hip: [40, 37],
    arms: [[[30, 18], [20, 18]], [[50, 18], [60, 18]]],
    legs: [[[37, 48], [36, 60]], [[43, 48], [44, 60]]],
    band: [[20, 18], [60, 18]],
  }],
  yoga_breath: [{
    front: true, head: [40, 22], neck: [40, 28], hip: [40, 50],
    arms: [[[50, 38], [53, 52]], [[30, 38], [27, 52]]],
    legs: [[[54, 54], [36, 58]], [[26, 54], [44, 58]]],
  }],
  yoga_sun_salute: [reachUp, forwardFold, highPlank, downDog],
  yoga_down_dog: [downDog],
  yoga_low_lunge: [{
    head: [45, 25], neck: [40, 30], hip: [38, 50],
    arms: [[[40, 20], [40, 10]], [[39, 20], [38, 10]]],
    legs: [[[52, 48], [54, 60]], [[28, 60], [14, 60]]],
  }],
  yoga_warrior2: [{
    front: true, head: [42, 11], neck: [40, 17], hip: [40, 38],
    arms: [[[52, 18], [64, 18]], [[28, 18], [16, 18]]],
    legs: [[[56, 47], [58, 60]], [[27, 49], [14, 60]]],
  }],
  yoga_triangle: [{
    front: true, head: [59, 28], neck: [54, 31], hip: [37, 40],
    arms: [[[55, 41], [56, 51]], [[53, 21], [52, 11]]],
    legs: [[[49, 50], [60, 60]], [[25, 50], [14, 60]]],
  }],
  yoga_pigeon: [{
    head: [43, 26], neck: [42, 32], hip: [40, 52],
    arms: [[[47, 43], [52, 58]], [[45, 43], [50, 58]]],
    legs: [[[54, 57], [42, 60]], [[24, 59], [8, 60]]],
  }],
  yoga_childs: [{
    head: [53, 57], neck: [48, 55], hip: [27, 53], spine: [38, 41],
    arms: [[[59, 58], [70, 59]], [[58, 58], [69, 59]]],
    legs: [[[40, 60], [24, 60]]],
  }],
  mob_90_90: [ninetyNinety, mirror(ninetyNinety)],
  mob_thoracic: [
    { noGround: true, head: [14, 50], neck: [20, 52], hip: [42, 52], arms: [[[22, 42], [24, 32]], [[21, 42], [23, 32]]], legs: [[[46, 40], [58, 40]]] },
    { noGround: true, head: [14, 50], neck: [20, 52], hip: [42, 52], arms: [[[18, 62], [12, 64]], [[21, 42], [23, 32]]], legs: [[[46, 40], [58, 40]]] },
  ],
  mob_hamstring: [{
    head: [12, 55], neck: [18, 57], hip: [40, 57],
    arms: [[[26, 48], [36, 40]]],
    legs: [[[42, 45], [44, 33]], [[52, 58], [64, 58]]],
    band: [[36, 40], [44, 33]],
  }],
  mob_couch: [{
    wall: 10, head: [25, 22], neck: [24, 28], hip: [22, 48],
    arms: [[[30, 38], [36, 46]]],
    legs: [[[14, 60], [12, 44]], [[38, 48], [40, 60]]],
  }],
  mob_deep_squat: [{
    front: true, head: [40, 24], neck: [40, 30], hip: [40, 50],
    arms: [[[48, 44], [42, 36]], [[32, 44], [38, 36]]],
    legs: [[[53, 46], [50, 60]], [[27, 46], [30, 60]]],
  }],
  mob_dead_hang: [{
    front: true, noGround: true, bar: 4, head: [40, 14], neck: [40, 20], hip: [40, 40],
    arms: [[[36, 12], [34, 4]], [[44, 12], [46, 4]]],
    legs: [[[40, 50], [40, 59]]],
  }],
  plank: [{
    head: [60, 47], neck: [54, 49], hip: [32, 53],
    arms: [[[54, 59], [64, 59]]],
    legs: [[[21, 56], [8, 59]]],
  }],
  side_plank: [{
    front: true, head: [61, 38], neck: [56, 42], hip: [34, 51],
    arms: [[[56, 59], [66, 59]], [[57, 32], [58, 22]]],
    legs: [[[23, 55], [11, 59]]],
  }],
  dead_bug: [
    deadBugStart,
    { ...deadBugStart, arms: [[[19, 46], [20, 37]], [[10, 51], [2, 49]]], legs: [[[42, 44], [53, 44]], [[52, 53], [64, 54]]] },
  ],
  hollow_hold: [{
    head: [21, 48], neck: [24, 53], hip: [40, 57], spine: [32, 59],
    arms: [[[16, 45], [8, 39]]],
    legs: [[[52, 55], [64, 52]]],
  }],
  bird_dog: [{
    head: [56, 36], neck: [52, 42], hip: [26, 48],
    arms: [[[62, 40], [72, 38]], [[51, 51], [51, 60]]],
    legs: [[[14, 46], [3, 44]], [[26, 60], [12, 60]]],
  }],
}

/** YouTube search for a short how-to video (needs internet). */
export function howToUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} how to`)}`
}
