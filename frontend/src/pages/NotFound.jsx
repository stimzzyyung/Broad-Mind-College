import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="card" style={{ margin: '40px auto', maxWidth: 480 }}>
      <EmptyState
        icon={SearchX}
        title="That page does not exist"
        text="The link may be old, or typed wrongly."
        action={<Link className="btn btn-primary" to={user ? `/${user.role}` : '/login'}>Go to {user ? 'home' : 'login'}</Link>}
      />
    </div>
  );
}
