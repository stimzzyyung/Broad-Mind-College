import {
  LayoutDashboard, UserPlus, GraduationCap, Users, School, Award,
  MonitorPlay, Wallet, User, ClipboardList, Baby,
  Clock, Calendar, HelpCircle, Archive, Sliders, BarChart3,
  Trophy, ShieldAlert, Layers
} from 'lucide-react';

// The side navigation for each portal. To add a page:
//  1) add an item here   2) add its route in routes/AppRoutes.jsx
// Logout is added automatically at the bottom of the sidebar.
export const navigation = {
  admin: [
    { title: null, items: [{ label: 'Home', to: '/admin', icon: LayoutDashboard, end: true }] },
    {
      title: 'CBT & Examination',
      items: [
        { label: 'CBT Examinations', to: '/exams', icon: Clock },
        { label: 'Question Bank', to: '/question-bank', icon: HelpCircle },
        { label: 'Question Archive', to: '/question-bank/archive', icon: Archive },
        { label: 'Exam Schedule', to: '/exam-schedule', icon: Calendar },
        { label: 'Exam Results', to: '/exam-results', icon: Award },
        { label: 'Generate Position', to: '/generate-position', icon: Trophy },
        { label: 'Attempts & Overrides', to: '/exam-attempts', icon: Sliders },
        { label: 'Exam Reports', to: '/exam-reports', icon: BarChart3 },
        { label: 'Class Categories', to: '/class-categories', icon: Layers },
        { label: 'Exam Levels', to: '/exam-levels', icon: School },
      ],
    },
    {
      title: 'People',
      items: [
        { label: 'Register students', to: '/admin/register-student', icon: UserPlus },
        { label: 'Students', to: '/admin/students', icon: GraduationCap },
        { label: 'Teachers', to: '/admin/teachers', icon: Users },
      ],
    },
    {
      title: 'School',
      items: [
        { label: 'Classes', to: '/admin/classes', icon: School },
        { label: 'Term Results', to: '/admin/results', icon: Award },
        { label: 'LMS Quizzes', to: '/admin/lms', icon: MonitorPlay },
      ],
    },
    { title: 'Finance', items: [{ label: 'Fees & receipts', to: '/admin/fees', icon: Wallet }] },
    { title: 'Account', items: [{ label: 'Profile', to: '/admin/profile', icon: User }] },
  ],

  teacher: [
    { title: null, items: [{ label: 'Home', to: '/teacher', icon: LayoutDashboard, end: true }] },
    {
      title: 'CBT & Examination',
      items: [
        { label: 'CBT Examinations', to: '/exams', icon: Clock },
        { label: 'Question Bank', to: '/question-bank', icon: HelpCircle },
        { label: 'Question Archive', to: '/question-bank/archive', icon: Archive },
        { label: 'Exam Schedule', to: '/exam-schedule', icon: Calendar },
        { label: 'Exam Results', to: '/exam-results', icon: Award },
        { label: 'Candidate Attempts', to: '/exam-attempts', icon: Sliders },
        { label: 'Exam Reports', to: '/exam-reports', icon: BarChart3 },
      ],
    },
    {
      title: 'Teaching',
      items: [
        { label: 'Classes', to: '/teacher/classes', icon: School },
        { label: 'Enter results', to: '/teacher/results', icon: ClipboardList },
        { label: 'LMS Quizzes', to: '/teacher/lms', icon: MonitorPlay },
      ],
    },
    { title: 'Account', items: [{ label: 'Profile', to: '/teacher/profile', icon: User }] },
  ],

  student: [
    { title: null, items: [{ label: 'Home', to: '/student', icon: LayoutDashboard, end: true }] },
    {
      title: 'CBT Examination',
      items: [
        { label: 'My Examinations', to: '/exams', icon: Clock },
        { label: 'Exam Schedule', to: '/exam-schedule', icon: Calendar },
        { label: 'CBT Results', to: '/exam-results', icon: Award },
      ],
    },
    {
      title: 'School',
      items: [
        { label: 'Classes', to: '/student/classes', icon: School },
        { label: 'Term Report', to: '/student/results', icon: Award },
        { label: 'LMS Quizzes', to: '/student/lms', icon: MonitorPlay },
      ],
    },
    { title: 'Payments', items: [{ label: 'Fees & receipts', to: '/student/fees', icon: Wallet }] },
    { title: 'Account', items: [{ label: 'Profile', to: '/student/profile', icon: User }] },
  ],

  parent: [
    { title: null, items: [{ label: 'Home', to: '/parent', icon: LayoutDashboard, end: true }] },
    { title: 'Family', items: [{ label: 'My children', to: '/parent/children', icon: Baby }] },
    { title: 'Payments', items: [{ label: 'Pay fees & receipts', to: '/parent/fees', icon: Wallet }] },
    { title: 'Account', items: [{ label: 'Profile', to: '/parent/profile', icon: User }] },
  ],
};

export const roleLabels = {
  admin: "Principal's portal",
  teacher: 'Teacher portal',
  student: 'Student portal',
  parent: 'Parent portal',
};

// Finds the page title for the top bar
export function titleFor(role, pathname) {
  const items = (navigation[role] || []).flatMap((group) => group.items);
  const match = items
    .filter((item) => pathname === item.to || pathname.startsWith(item.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match ? match.label : 'CBT Portal';
}
