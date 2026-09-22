export const WALL_Z = 0;
export const FIELD_DEPTH = 12;
export const FIELD_HALF_WIDTH = 6;
export const WALL_HEIGHT = 5;

export const BALL_R = 0.045;
export const BUCKET_R = 0.35;
export const BUCKET_H = 0.36;
export const BUCKET_WALL_T = 0.012;

/** In-flight damping: near zero so throws carry realistically. */
export const BALL_LINEAR_DAMPING = 0.04;
export const BALL_ANGULAR_DAMPING = 0.3;

/** Rolling resistance, applied only while the ball is slow and on the ground. */
export const ROLL_LINEAR_DAMPING = 2.6;
export const ROLL_ANGULAR_DAMPING = 5;
export const ROLL_SPEED_THRESHOLD = 4;

export const THROW_HEIGHT = 1.55;
export const MIN_SPEED = 5;
export const MAX_SPEED = 17;

/** Average of the ball and court restitution — used by the aiming preview. */
export const PREVIEW_RESTITUTION = 0.76;

/**
 * Placement limits. These are deliberately tight: outside this zone a legal
 * ground-then-wall-then-bucket shot is not physically achievable, so players are
 * prevented from setting up an impossible round.
 */
export const BUCKET_MIN_Z = 0.6;
export const BUCKET_MAX_Z = 2.5;
export const FEATHER_MIN_GAP = 2.0;
export const FEATHER_MAX_GAP = 5.5;
export const PLACE_HALF_WIDTH = 2.0;

export const MAX_YAW = Math.PI / 3.6;
export const MIN_PITCH = -0.9;
export const MAX_PITCH = 1.1;

export const FLIGHT_TIMEOUT = 12;
export const SETTLE_IN_BUCKET = 0.5;

export const PLAYER_COLORS = [
  '#ffb703', '#4cc9f0', '#57d364', '#ff6b6b', '#c77dff',
  '#f72585', '#7bdff2', '#fca311', '#90be6d', '#b5179e'
];

export type Phase =
  | 'setup'
  | 'placeBucket'
  | 'placeFeather'
  | 'aim'
  | 'flight'
  | 'result'
  | 'roundEnd';

export interface Player {
  id: number;
  name: string;
  color: string;
  score: number;
}

export type MissReason =
  | 'wallFirst'
  | 'doubleBounce'
  | 'doubleWall'
  | 'bounceAfterWall'
  | 'noSequence'
  | 'missedBucket'
  | 'outOfPlay'
  | 'timeout';

export interface ThrowResult {
  scored: boolean;
  reason?: MissReason;
}

export const MISS_TEXT: Record<MissReason, string> = {
  wallFirst: 'Hit the wall before the ground.',
  doubleBounce: 'Bounced on the ground twice before the wall.',
  doubleWall: 'Hit the wall twice.',
  bounceAfterWall: 'Touched the ground again after the wall.',
  noSequence: 'In the bucket, but not off the ground and wall first.',
  missedBucket: 'Good sequence, but it never settled in the bucket.',
  outOfPlay: 'The ball left the court.',
  timeout: 'Ran out of time.'
};
