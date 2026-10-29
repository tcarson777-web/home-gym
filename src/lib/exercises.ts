import type { Capability, Loading } from './equipment'

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'hpush'
  | 'vpush'
  | 'hpull'
  | 'vpull'
  | 'single_leg'
  | 'core'
  | 'carry'
  | 'warmup'
  | 'yoga'
  | 'mobility'

export interface Exercise {
  id: string
  name: string
  pattern: Pattern
  loading: Loading
  requires: Capability[] // all of these must be available
  lowerBody?: boolean
  cue: string
}

// Ordered so that, within each pattern, the best strength option comes first.
export const EXERCISES: Exercise[] = [
  // Squat
  { id: 'bb_back_squat', name: 'Barbell back squat', pattern: 'squat', loading: 'barbell', requires: ['barbell', 'rack'], lowerBody: true, cue: 'Brace, sit between your hips, knees track over toes, drive up.' },
  { id: 'db_goblet_squat', name: 'Dumbbell goblet squat', pattern: 'squat', loading: 'dumbbell', requires: ['dumbbell'], lowerBody: true, cue: 'Hold the bell at your chest, elbows inside knees at the bottom.' },
  { id: 'kb_goblet_squat', name: 'Kettlebell goblet squat', pattern: 'squat', loading: 'kettlebell', requires: ['kettlebell'], lowerBody: true, cue: 'Hold the horns at your chest, chest tall, full depth.' },
  { id: 'bw_split_squat', name: 'Split squat', pattern: 'squat', loading: 'bodyweight', requires: [], lowerBody: true, cue: 'Long stance, back knee lowers straight down.' },
  // Hinge
  { id: 'bb_deadlift', name: 'Barbell deadlift', pattern: 'hinge', loading: 'barbell', requires: ['barbell', 'plates'], lowerBody: true, cue: 'Bar over mid-foot, flat back, push the floor away.' },
  { id: 'db_rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', loading: 'dumbbell', requires: ['dumbbell'], lowerBody: true, cue: 'Soft knees, push hips back, bells slide down your thighs.' },
  { id: 'kb_rdl', name: 'Kettlebell Romanian deadlift', pattern: 'hinge', loading: 'kettlebell', requires: ['kettlebell'], lowerBody: true, cue: 'Hips back, flat back, stand tall and squeeze glutes.' },
  { id: 'bw_sl_glute_bridge', name: 'Single-leg glute bridge', pattern: 'hinge', loading: 'bodyweight', requires: [], lowerBody: true, cue: 'Drive through the heel, ribs down, pause at the top.' },
  // Horizontal push
  { id: 'bb_bench', name: 'Barbell bench press', pattern: 'hpush', loading: 'barbell', requires: ['barbell', 'bench', 'rack'], cue: 'Shoulder blades pinched, feet planted, bar to lower chest. Use safeties.' },
  { id: 'db_bench', name: 'Dumbbell bench press', pattern: 'hpush', loading: 'dumbbell', requires: ['dumbbell', 'bench'], cue: 'Elbows ~45°, lower under control, press up and slightly in.' },
  { id: 'db_floor_press', name: 'Dumbbell floor press', pattern: 'hpush', loading: 'dumbbell', requires: ['dumbbell'], cue: 'Lie on the floor, upper arms touch down softly, press.' },
  { id: 'bw_pushup', name: 'Push-up', pattern: 'hpush', loading: 'bodyweight', requires: [], cue: 'Body in a straight line, chest to just above the floor.' },
  // Vertical push
  { id: 'bb_ohp', name: 'Barbell overhead press', pattern: 'vpush', loading: 'barbell', requires: ['barbell', 'rack'], cue: 'Squeeze glutes, press the bar straight up, head through at the top.' },
  { id: 'db_shoulder_press', name: 'Dumbbell shoulder press', pattern: 'vpush', loading: 'dumbbell', requires: ['dumbbell'], cue: 'Ribs down, press overhead without arching your back.' },
  { id: 'kb_press', name: 'Kettlebell overhead press', pattern: 'vpush', loading: 'kettlebell', requires: ['kettlebell'], cue: 'Bell rests on forearm, press straight up, one arm at a time.' },
  { id: 'bw_pike_pushup', name: 'Pike push-up', pattern: 'vpush', loading: 'bodyweight', requires: [], cue: 'Hips high, lower your head toward the floor between your hands.' },
  // Horizontal pull
  { id: 'bb_row', name: 'Barbell row', pattern: 'hpull', loading: 'barbell', requires: ['barbell', 'plates'], cue: 'Hinge to ~45°, pull the bar to your belly button.' },
  { id: 'db_row', name: 'One-arm dumbbell row', pattern: 'hpull', loading: 'dumbbell', requires: ['dumbbell'], cue: 'Brace on a bench or knee, pull elbow to hip. Reps are per arm.' },
  { id: 'kb_row', name: 'Kettlebell row', pattern: 'hpull', loading: 'kettlebell', requires: ['kettlebell'], cue: 'Flat back, pull to hip, lower slowly. Reps are per arm.' },
  { id: 'ring_row', name: 'Ring / suspension row', pattern: 'hpull', loading: 'bodyweight', requires: ['rings'], cue: 'Body straight, pull chest to hands. Walk feet forward to make it harder.' },
  { id: 'band_row', name: 'Band row', pattern: 'hpull', loading: 'band', requires: ['band'], cue: 'Anchor the band, squeeze shoulder blades together.' },
  // Vertical pull
  { id: 'pullup', name: 'Pull-up', pattern: 'vpull', loading: 'bodyweight', requires: ['pullup_bar'], cue: 'Full hang to chin over bar. Use a band for help if needed.' },
  { id: 'band_pulldown', name: 'Band lat pulldown', pattern: 'vpull', loading: 'band', requires: ['band'], cue: 'Anchor high, pull elbows down to your ribs.' },
  // Single-leg accessories
  { id: 'db_reverse_lunge', name: 'Dumbbell reverse lunge', pattern: 'single_leg', loading: 'dumbbell', requires: ['dumbbell'], lowerBody: true, cue: 'Step back, both knees to 90°. Reps are per leg.' },
  { id: 'db_bulgarian', name: 'Dumbbell Bulgarian split squat', pattern: 'single_leg', loading: 'dumbbell', requires: ['dumbbell', 'bench'], lowerBody: true, cue: 'Back foot on the bench, front shin mostly vertical. Reps per leg.' },
  { id: 'bw_step_up', name: 'Step-up', pattern: 'single_leg', loading: 'bodyweight', requires: ['box'], lowerBody: true, cue: 'Drive through the top foot, control the way down. Reps per leg.' },
  { id: 'bw_reverse_lunge', name: 'Reverse lunge', pattern: 'single_leg', loading: 'bodyweight', requires: [], lowerBody: true, cue: 'Step back, both knees to 90°. Reps are per leg.' },
  // Carry
  { id: 'db_farmer_carry', name: 'Farmer carry (dumbbells)', pattern: 'carry', loading: 'dumbbell', requires: ['dumbbell'], cue: 'Heavy bells, tall posture, short quick steps.' },
  { id: 'kb_farmer_carry', name: 'Farmer carry (kettlebells)', pattern: 'carry', loading: 'kettlebell', requires: ['kettlebell'], cue: 'Heavy bells, tall posture, short quick steps.' },
  // Core
  { id: 'plank', name: 'Plank', pattern: 'core', loading: 'bodyweight', requires: [], cue: 'Squeeze glutes, ribs down, straight line head to heels.' },
  { id: 'dead_bug', name: 'Dead bug', pattern: 'core', loading: 'bodyweight', requires: [], cue: 'Low back pressed into the floor, slowly extend opposite arm and leg.' },
  { id: 'side_plank', name: 'Side plank', pattern: 'core', loading: 'bodyweight', requires: [], cue: 'Hips high, body straight. Time is per side.' },
  { id: 'hollow_hold', name: 'Hollow body hold', pattern: 'core', loading: 'bodyweight', requires: [], cue: 'Low back flat, arms and legs long and just off the floor.' },
  { id: 'bird_dog', name: 'Bird dog', pattern: 'core', loading: 'bodyweight', requires: [], cue: 'Reach opposite arm and leg long without rocking your hips.' },
  { id: 'hanging_knee_raise', name: 'Hanging knee raise', pattern: 'core', loading: 'bodyweight', requires: ['pullup_bar'], cue: 'No swinging; curl your pelvis up, not just your knees.' },
  // Warm-up
  { id: 'wu_rope', name: 'Easy jump rope', pattern: 'warmup', loading: 'bodyweight', requires: ['jump_rope'], cue: 'Light and easy, just get warm.' },
  { id: 'wu_cardio', name: 'Easy bike / row', pattern: 'warmup', loading: 'bodyweight', requires: ['cardio'], cue: 'Conversational pace.' },
  { id: 'wu_jacks', name: 'Jumping jacks / marching', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Easy pace; march in place if you prefer low impact.' },
  { id: 'wu_cat_cow', name: 'Cat-cow', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Slowly round and arch your spine with your breath.' },
  { id: 'wu_wgs', name: "World's greatest stretch", pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Lunge, elbow to instep, rotate and reach up. Alternate sides.' },
  { id: 'wu_glute_bridge', name: 'Glute bridge', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Squeeze at the top for a second.' },
  { id: 'wu_band_pullapart', name: 'Band pull-apart', pattern: 'warmup', loading: 'band', requires: ['band'], cue: 'Arms straight, pull the band to your chest.' },
  { id: 'wu_bw_squat', name: 'Bodyweight squat', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Slow, full depth, pause at the bottom.' },
  { id: 'wu_inchworm', name: 'Inchworm', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Walk hands out to a plank and back.' },
  { id: 'wu_arm_circles', name: 'Arm circles & shoulder rolls', pattern: 'warmup', loading: 'bodyweight', requires: [], cue: 'Small to big circles, both directions.' },
  // Yoga
  { id: 'yoga_breath', name: 'Seated breathing', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Slow nasal breaths: 4 seconds in, 6 out.' },
  { id: 'yoga_sun_salute', name: 'Sun salutation (slow)', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Move with the breath; repeat continuously.' },
  { id: 'yoga_down_dog', name: 'Downward dog', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Hips high, pedal the heels, long spine.' },
  { id: 'yoga_low_lunge', name: 'Low lunge', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Back knee down, hips forward. Time is per side.' },
  { id: 'yoga_warrior2', name: 'Warrior II', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Front knee over ankle, arms long. Per side.' },
  { id: 'yoga_triangle', name: 'Triangle pose', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Long side body, hand to shin. Per side.' },
  { id: 'yoga_pigeon', name: 'Pigeon pose', pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Square hips, fold forward if comfortable. Per side.' },
  { id: 'yoga_childs', name: "Child's pose", pattern: 'yoga', loading: 'bodyweight', requires: [], cue: 'Knees wide, breathe into your back.' },
  // Mobility / cool-down
  { id: 'mob_90_90', name: '90/90 hip switches', pattern: 'mobility', loading: 'bodyweight', requires: [], cue: 'Sit tall, rotate knees side to side slowly.' },
  { id: 'mob_thoracic', name: 'Open-book thoracic rotation', pattern: 'mobility', loading: 'bodyweight', requires: [], cue: 'Lie on your side, rotate your top arm open. Per side.' },
  { id: 'mob_hamstring', name: 'Hamstring stretch', pattern: 'mobility', loading: 'bodyweight', requires: [], cue: 'Lying down, use a band or towel. Per side.' },
  { id: 'mob_couch', name: 'Couch stretch', pattern: 'mobility', loading: 'bodyweight', requires: [], cue: 'Back knee against a wall, squeeze the glute. Per side.' },
  { id: 'mob_deep_squat', name: 'Deep squat hold', pattern: 'mobility', loading: 'bodyweight', requires: [], cue: 'Hold something for balance, relax into the bottom.' },
  { id: 'mob_dead_hang', name: 'Dead hang', pattern: 'mobility', loading: 'bodyweight', requires: ['pullup_bar'], cue: 'Relax your shoulders and breathe.' },
]

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))

export function canDo(ex: Exercise, caps: Set<Capability>, loadsAvailable: (l: Loading) => boolean): boolean {
  if (!ex.requires.every((c) => caps.has(c))) return false
  // A dumbbell exercise is useless if no dumbbell weights were entered, etc.
  if (ex.loading === 'barbell' || ex.loading === 'dumbbell' || ex.loading === 'kettlebell') return loadsAvailable(ex.loading)
  return true
}
