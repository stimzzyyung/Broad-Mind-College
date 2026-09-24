import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';

import Login from '../pages/Login.jsx';
import Signup from '../pages/Signup.jsx';
import NotFound from '../pages/NotFound.jsx';
import Profile from '../pages/shared/Profile.jsx';

// ----- Principal (admin) portal -----
import AdminHome from '../pages/admin/AdminHome.jsx';
import RegisterStudent from '../pages/admin/RegisterStudent.jsx';
import Students from '../pages/admin/Students.jsx';
import Teachers from '../pages/admin/Teachers.jsx';
import AdminClasses from '../pages/admin/AdminClasses.jsx';
import AdminResults from '../pages/admin/AdminResults.jsx';
import AdminLMS from '../pages/admin/AdminLMS.jsx';
import AdminFees from '../pages/admin/AdminFees.jsx';

// ----- Teacher portal -----
import TeacherHome from '../pages/teacher/TeacherHome.jsx';
import TeacherClasses from '../pages/teacher/TeacherClasses.jsx';
import TeacherResults from '../pages/teacher/TeacherResults.jsx';
import TeacherLMS from '../pages/teacher/TeacherLMS.jsx';
import QuizBuilder from '../pages/teacher/QuizBuilder.jsx';

// ----- Student portal -----
import StudentHome from '../pages/student/StudentHome.jsx';
import StudentClasses from '../pages/student/StudentClasses.jsx';
import StudentResults from '../pages/student/StudentResults.jsx';
import StudentLMS from '../pages/student/StudentLMS.jsx';
import TakeQuiz from '../pages/student/TakeQuiz.jsx';
import StudentFees from '../pages/student/StudentFees.jsx';

// ----- Parent portal -----
import ParentHome from '../pages/parent/ParentHome.jsx';
import ParentChildren from '../pages/parent/ParentChildren.jsx';
import ParentFees from '../pages/parent/ParentFees.jsx';

// ----- Advanced CBT & Examination Management System Pages -----
import QuestionBank from '../pages/cbt/QuestionBank.jsx';
import QuestionCreate from '../pages/cbt/QuestionCreate.jsx';
import QuestionArchive from '../pages/cbt/QuestionArchive.jsx';
import ExamsList from '../pages/cbt/ExamsList.jsx';
import ExamCreate from '../pages/cbt/ExamCreate.jsx';
import ExamDetails from '../pages/cbt/ExamDetails.jsx';
import ExamTake from '../pages/cbt/ExamTake.jsx';
import ExamResults from '../pages/cbt/ExamResults.jsx';
import GeneratePosition from '../pages/cbt/GeneratePosition.jsx';
import ClassCategories from '../pages/cbt/ClassCategories.jsx';
import ExamLevels from '../pages/cbt/ExamLevels.jsx';
import ExamSchedule from '../pages/cbt/ExamSchedule.jsx';
import ExamAttempts from '../pages/cbt/ExamAttempts.jsx';
import ExamReports from '../pages/cbt/ExamReports.jsx';

// "/" sends people to their own portal, or to the login page
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Signup />} />

      {/* Standalone CBT Exam Runner (No distracting sidebar layout) */}
      <Route
        path="/exams/:id/take"
        element={
          <ProtectedRoute roles={['student']}>
            <ExamTake />
          </ProtectedRoute>
        }
      />

      {/* ============================================================== */}
      {/* Root-Level CBT Routes with DashboardLayout */}
      {/* ============================================================== */}

      {/* Question Bank Routes (Staff: Admin & Teacher) */}
      <Route
        path="/question-bank"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<QuestionBank />} />
        <Route path="create" element={<QuestionCreate />} />
        <Route path="archive" element={<QuestionArchive />} />
      </Route>

      {/* CBT Examinations Routes (All Authenticated Roles) */}
      <Route
        path="/exams"
        element={
          <ProtectedRoute roles={['admin', 'teacher', 'student']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamsList />} />
        <Route
          path="create"
          element={
            <ProtectedRoute roles={['admin', 'teacher']}>
              <ExamCreate />
            </ProtectedRoute>
          }
        />
        <Route path=":id" element={<ExamDetails />} />
        <Route path=":id/results" element={<ExamResults />} />
        <Route
          path=":id/attempts"
          element={
            <ProtectedRoute roles={['admin', 'teacher']}>
              <ExamAttempts />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Dedicated CBT Features */}
      <Route
        path="/exam-results"
        element={
          <ProtectedRoute roles={['admin', 'teacher', 'student']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamResults />} />
      </Route>

      <Route
        path="/exam-schedule"
        element={
          <ProtectedRoute roles={['admin', 'teacher', 'student']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamSchedule />} />
      </Route>

      <Route
        path="/generate-position"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<GeneratePosition />} />
      </Route>

      <Route
        path="/class-categories"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ClassCategories />} />
      </Route>

      <Route
        path="/exam-levels"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamLevels />} />
      </Route>

      <Route
        path="/exam-attempts"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamAttempts />} />
      </Route>

      <Route
        path="/exam-reports"
        element={
          <ProtectedRoute roles={['admin', 'teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExamReports />} />
      </Route>

      {/* ============================================================== */}
      {/* Existing Role-based Portal Portions */}
      {/* ============================================================== */}

      {/* Principal / admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="register-student" element={<RegisterStudent />} />
        <Route path="students" element={<Students />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="classes" element={<AdminClasses />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="lms" element={<AdminLMS />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Teacher */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={['teacher']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="classes" element={<TeacherClasses />} />
        <Route path="results" element={<TeacherResults />} />
        <Route path="lms" element={<TeacherLMS />} />
        <Route path="lms/new" element={<QuizBuilder />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Student */}
      <Route
        path="/student"
        element={
          <ProtectedRoute roles={['student']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="classes" element={<StudentClasses />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="lms" element={<StudentLMS />} />
        <Route path="lms/:quizId" element={<TakeQuiz />} />
        <Route path="fees" element={<StudentFees />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Parent */}
      <Route
        path="/parent"
        element={
          <ProtectedRoute roles={['parent']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ParentHome />} />
        <Route path="children" element={<ParentChildren />} />
        <Route path="fees" element={<ParentFees />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
