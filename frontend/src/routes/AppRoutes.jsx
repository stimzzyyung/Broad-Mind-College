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
