import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import AppRoutes from './routes/AppRoutes.jsx';
import GlobalLoader from './components/ui/GlobalLoader.jsx';

// The providers wrap everything so any page can use login info and pop-up messages
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <GlobalLoader />
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
