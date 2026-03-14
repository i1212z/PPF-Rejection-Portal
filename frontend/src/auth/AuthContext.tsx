import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

type UserRole = 'b2b' | 'b2c' | 'manager' | 'admin';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ppf-backend.onrender.com';

function decodeToken(token: string): { userId: string; role: UserRole } | null {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload));
    return { userId: json.sub as string, role: json.role as UserRole };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ppf_token');
    if (!stored) {
      setIsInitialized(true);
      return;
    }

    const decoded = decodeToken(stored);
    if (!decoded) {
      localStorage.removeItem('ppf_token');
      setIsInitialized(true);
      return;
    }

    setToken(stored);
    setUser({
      id: decoded.userId,
      name: 'User',
      email: '',
      role: decoded.role,
    });
    setIsInitialized(true);
  }, []);

  const login = async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const res = await axios.post<{ access_token: string }>(
      `${API_BASE_URL}/auth/login`,
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const accessToken = res.data.access_token;
    localStorage.setItem('ppf_token', accessToken);
    setToken(accessToken);

    const decoded = decodeToken(accessToken);
    if (decoded) {
      setUser({
        id: decoded.userId,
        name: email.split('@')[0],
        email,
        role: decoded.role,
      });
    } else {
      setUser({
        id: '',
        name: email.split('@')[0],
        email,
        role: 'admin',
      });
    }
  };

  const logout = () => {
    localStorage.removeItem('ppf_token');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isInitialized, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

