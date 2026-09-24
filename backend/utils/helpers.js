// Small helper functions used by several routes.

const SCHOOL_CODE = 'CVC';
const TERMS = ['First Term', 'Second Term', 'Third Term'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Grading scale. Change these numbers if your school uses a different scale.
function gradeFor(total) {
  if (total >= 75) return { grade: 'A1', remark: 'Excellent' };
  if (total >= 70) return { grade: 'B2', remark: 'Very good' };
  if (total >= 65) return { grade: 'B3', remark: 'Good' };
  if (total >= 60) return { grade: 'C4', remark: 'Credit' };
  if (total >= 55) return { grade: 'C5', remark: 'Credit' };
  if (total >= 50) return { grade: 'C6', remark: 'Credit' };
  if (total >= 45) return { grade: 'D7', remark: 'Pass' };
  if (total >= 40) return { grade: 'E8', remark: 'Pass' };
  return { grade: 'F9', remark: 'Fail' };
}

// Lets us sort terms from oldest to newest, e.g. "2025/2026 Third Term" < "2026/2027 First Term"
function termRank(term, session) {
  return parseInt(session.slice(0, 4), 10) * 10 + TERMS.indexOf(term);
}

// Never send the password hash to the browser
function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// Ids of the classes a teacher is form teacher of, or teaches a subject in
function teacherClassIds(data, teacherId) {
  return data.classes
    .filter((c) => c.formTeacherId === teacherId || c.subjects.some((s) => s.teacherId === teacherId))
    .map((c) => c.id);
}

// Today's weekday. On weekends we show Monday instead so the timetable is never empty.
function schoolDay() {
  const today = DAYS[new Date().getDay()];
  if (today === 'Saturday' || today === 'Sunday') return { day: 'Monday', isToday: false };
  return { day: today, isToday: true };
}

// Ranks every student in a class for one term (used for report cards and admin results)
function classRanking(data, classId, term, session) {
  const students = data.users.filter((u) => u.role === 'student' && u.classId === classId);
  const rows = students
    .map((student) => {
      const scores = data.results.filter(
        (r) => r.studentId === student.id && r.term === term && r.session === session
      );
      const total = scores.reduce((sum, r) => sum + r.total, 0);
      const average = scores.length ? Number((total / scores.length).toFixed(1)) : 0;
      return { student, subjects: scores.length, total, average };
    })
    .filter((row) => row.subjects > 0)
    .sort((a, b) => b.average - a.average);

  rows.forEach((row, i) => {
    row.position = i > 0 && row.average === rows[i - 1].average ? rows[i - 1].position : i + 1;
    row.grade = gradeFor(row.average).grade;
  });
  return rows;
}

// How much a student has paid / owes for each fee item this term
function feeStatus(data, studentId) {
  const { session, term } = data.settings;
  return data.fees
    .filter((f) => f.session === session && f.term === term)
    .map((fee) => {
      const paid = data.payments
        .filter((p) => p.studentId === studentId && p.feeId === fee.id && p.status === 'success')
        .reduce((sum, p) => sum + p.amount, 0);
      const balance = Math.max(fee.amount - paid, 0);
      const status = balance === 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid';
      return { ...fee, paid, balance, status };
    });
}

module.exports = {
  SCHOOL_CODE,
  TERMS,
  gradeFor,
  termRank,
  safeUser,
  teacherClassIds,
  schoolDay,
  classRanking,
  feeStatus,
};
