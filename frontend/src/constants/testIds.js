export const HOME = { emergentLink: "emergent-link" };

export const NAV = {
  leaderboard: "nav-leaderboard",
  commanders: "nav-commanders",
  points: "nav-points",
  addPoints: "nav-add-points",
  pointsAbout: "nav-points-about",
  pointCalc: "nav-point-calc",
  reports: "nav-reports",
  members: "nav-members",
  events: "nav-events",
};

export const LEADERBOARD = {
  container: "leaderboard-page",
  statsMember: "stat-members",
  statsEvent: "stat-events",
  statsTotal: "stat-total",
  statsAvg: "stat-avg",
  filterActive: "filter-active",
  filterArchive: "filter-archive",
  exportButton: "export-report-btn",
  themeToggle: "theme-toggle",
  row: (id) => `leaderboard-row-${id}`,
};

export const MEMBERS = {
  container: "members-page",
  search: "members-search",
  addBtn: "members-add-btn",
  form: "member-form",
  formName: "member-form-name",
  formId: "member-form-id",
  formRank: "member-form-rank",
  formTitle: "member-form-title",
  formSubmit: "member-form-submit",
  card: (id) => `member-card-${id}`,
  editBtn: (id) => `member-edit-${id}`,
  deleteBtn: (id) => `member-delete-${id}`,
};

export const EVENTS = {
  container: "events-page",
  tabActive: "events-tab-active",
  tabArchived: "events-tab-archived",
  addBtn: "events-add-btn",
  formName: "event-form-name",
  formDate: "event-form-date",
  formMultiplier: "event-form-multiplier",
  formSubtitle: "event-form-subtitle",
  formSubmit: "event-form-submit",
  card: (id) => `event-card-${id}`,
  archiveBtn: (id) => `event-archive-${id}`,
  editBtn: (id) => `event-edit-${id}`,
  deleteBtn: (id) => `event-delete-${id}`,
};

export const POINTS = {
  container: "points-page",
  search: "points-search",
  row: (id) => `points-row-${id}`,
};

export const ADD_POINTS = {
  container: "add-points-page",
  memberSelect: "add-points-member",
  eventSelect: "add-points-event",
  pointsInput: "add-points-points",
  multiplier1x: "add-points-mult-1",
  multiplier15x: "add-points-mult-15",
  multiplier2x: "add-points-mult-2",
  multiplier3x: "add-points-mult-3",
  multiplierCustom: "add-points-mult-custom",
  note: "add-points-note",
  submit: "add-points-submit",
  bulkToggle: "add-points-bulk-toggle",
  bulkMember: (id) => `bulk-member-${id}`,
};

export const COMMANDERS = {
  container: "commanders-page",
  addBtn: "commanders-add-btn",
  card: (id) => `commander-card-${id}`,
  categoryItem: (key) => `category-item-${key}`,
};
