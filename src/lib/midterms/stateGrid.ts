// A hand-built, collision-checked "tilegram" layout — one square per state,
// arranged to approximate real geography without needing actual shapefiles.
// [row, col], 0-indexed, row 0 = north.
export const STATE_GRID: Record<string, [number, number]> = {
  WA: [1, 0], OR: [2, 0], CA: [3, 0],
  ID: [1, 1], NV: [2, 1], UT: [2, 2],
  MT: [0, 2], WY: [1, 2], AZ: [3, 2],
  ND: [0, 3], SD: [1, 3], CO: [2, 3], NM: [3, 3],
  MN: [0, 4], IA: [1, 4], NE: [2, 4],
  WI: [0, 5], IL: [1, 5], KS: [2, 5], OK: [3, 5],
  MI: [0, 6], IN: [1, 6], MO: [2, 6], TX: [4, 5],
  OH: [0, 7], WV: [1, 7], AR: [3, 6],
  PA: [0, 8], KY: [2, 7],
  NY: [0, 9], VA: [1, 8], TN: [3, 7], LA: [4, 6],
  VT: [0, 10], MD: [1, 9], NC: [2, 8], MS: [4, 7],
  NH: [0, 11], NJ: [1, 10], SC: [3, 8], AL: [4, 8],
  ME: [0, 12], CT: [1, 11], GA: [4, 9],
  RI: [1, 12], DE: [2, 9],
  MA: [1, 13],
  FL: [5, 9],
  AK: [7, 0], HI: [8, 0],
};

export const GRID_ROWS = 9;
export const GRID_COLS = 14;

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Approximate 2024 presidential margin per state, in points (positive = R).
// This is the "previous result" baseline the environment-shift model extrapolates
// from — approximate, not official certified figures, but a real anchor rather
// than an invented one. Swap for exact certified numbers whenever it matters.
export const STATE_PVI_2024: Record<string, number> = {
  AL: 30, AK: 13, AZ: 6, AR: 31, CA: -20, CO: -11, CT: -15, DE: -15, FL: 13, GA: 2,
  HI: -23, ID: 36, IL: -11, IN: 19, IA: 13, KS: 16, KY: 30, LA: 22, ME: -7, MD: -29,
  MA: -23, MI: 1.5, MN: -4, MS: 22, MO: 18, MT: 20, NE: 18, NV: 3, NH: -3, NJ: -6,
  NM: -6, NY: -12, NC: 3, ND: 36, OH: 11, OK: 34, OR: -16, PA: 1.5, RI: -8, SC: 18,
  SD: 29, TN: 29, TX: 14, UT: 22, VT: -34, VA: -6, WA: -19, WV: 42, WI: 1, WY: 45,
};

// The national environment those 2024 state margins sat inside (approx. 2024
// House popular vote margin), and a live-editable "right now" reading — see
// SplitTicket.tsx for the source and the slider that lets you update it.
export const PREVIOUS_GCB_R_MARGIN = 3; // R+3, 2024 national House popular vote (approx.)
export const DEFAULT_CURRENT_GCB_R_MARGIN = -6; // D+6, per Aug 2026 polling averages (DDHQ/Silver Bulletin/ActiVote), editable in-app

// 2020-census House apportionment (static fact, holds through the 2030 census).
export const HOUSE_APPORTIONMENT: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};
