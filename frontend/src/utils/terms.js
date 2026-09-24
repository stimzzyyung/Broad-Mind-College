export const TERMS = ['First Term', 'Second Term', 'Third Term'];

export const SUBJECTS = [
  'Mathematics', 'English Language', 'Basic Science',
  'Civic Education', 'Computer Studies', 'Social Studies',
];

// "2026/2027" -> ["2025/2026", "2026/2027"]
export function sessionOptions(current) {
  if (!current) return [];
  const start = parseInt(current.slice(0, 4), 10);
  return [`${start - 1}/${start}`, current];
}

// The term that just ended. Handy as a starting point for viewing results.
export function lastTerm(settings) {
  const index = TERMS.indexOf(settings.term);
  if (index > 0) return { term: TERMS[index - 1], session: settings.session };
  const start = parseInt(settings.session.slice(0, 4), 10);
  return { term: 'Third Term', session: `${start - 1}/${start}` };
}
