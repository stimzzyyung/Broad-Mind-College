import { CURRENCY, LOCALE } from '../config/school.js';

export function money(amount) {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function initials(name = '') {
  return name
    .replace(/^(Mr|Mrs|Miss|Dr|Prof)\.?\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// "Dr. Adaeze Okonkwo" -> "Dr. Adaeze",  "Chinedu Okafor" -> "Chinedu"
export function shortName(name = '') {
  const parts = name.split(' ');
  return /^(Mr|Mrs|Miss|Dr|Prof)\.?$/i.test(parts[0]) ? parts.slice(0, 2).join(' ') : parts[0];
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Colour of a grade badge
export function gradeTone(grade = '') {
  if (grade.startsWith('A') || grade.startsWith('B')) return 'ok';
  if (grade.startsWith('C')) return 'info';
  if (grade.startsWith('D') || grade.startsWith('E')) return 'warn';
  return 'danger';
}
