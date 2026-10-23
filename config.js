// Funnel definition. Order matters: it defines the funnel and conversion rates.
// `prob` is the win probability used for the weighted pipeline value.
export const STAGES = [
  { key: 'lead', label: 'New lead', prob: 10 },
  { key: 'qualified', label: 'Qualified', prob: 25 },
  { key: 'demo', label: 'Demo / Playtest', prob: 40 },
  { key: 'proposal', label: 'Proposal sent', prob: 60 },
  { key: 'negotiation', label: 'Negotiation', prob: 80 },
  { key: 'won', label: 'Won', prob: 100 },
  { key: 'lost', label: 'Lost', prob: 0 },
];

export const OPEN_STAGES = STAGES.filter(s => !['won', 'lost'].includes(s.key)).map(s => s.key);

// Position in the funnel; "lost" has none because it never advances a deal.
export const stageIndex = key => (key === 'lost' ? -1 : STAGES.findIndex(s => s.key === key));

export const SOURCES = [
  'Website',
  'Event / Conference',
  'Referral',
  'LinkedIn',
  'Cold outreach',
  'Existing customer',
  'Partner',
  'Other',
];

export const PRODUCTS = [
  'Custom serious game',
  'Off-the-shelf game licence',
  'Workshop / Game session',
  'Training programme',
  'Consultancy',
];

export const LOST_REASONS = [
  'No budget',
  'Chose competitor',
  'No decision / went silent',
  'Timing not right',
  'Not a fit',
  'Other',
];

export const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting'];
