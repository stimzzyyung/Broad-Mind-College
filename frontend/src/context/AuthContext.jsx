import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true); // true while we check for an old login

  // When the page loads, see if the saved token is still good
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((data) => {
        setUser(data.user);
        setSettings(data.settings);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(identifier, password, role) {
    const data = await api.post('/auth/login', { identifier, password, role });
    tokenStore.set(data.token);
    setUser(data.user);
    setSettings(data.settings);
    return data.user;
  }

  // Parent self-registration. Logs the new parent straight in, same as login() does.
  async function register(form) {
    const data = await api.post('/auth/register', form);
    tokenStore.set(data.token);
    setUser(data.user);
    setSettings(data.settings);
    return data.user;
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
    setSettings(null);
  }

  // Lets the Profile page refresh the name shown in the sidebar
  function updateUser(changes) {
    setUser((current) => ({ ...current, ...changes }));
  }

  return (
    <AuthContext.Provider value={{ user, settings, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
