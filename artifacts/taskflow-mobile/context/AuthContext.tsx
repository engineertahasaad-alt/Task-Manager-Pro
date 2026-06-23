import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';

const storage = Platform.OS === 'web'
  ? {
      getItemAsync: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItemAsync: (key: string, value: string) => Promise.resolve(void localStorage.setItem(key, value)),
      deleteItemAsync: (key: string) => Promise.resolve(void localStorage.removeItem(key)),
    }
  : (() => {
      const SecureStore = require('expo-secure-store');
      return {
        getItemAsync: (key: string) => SecureStore.getItemAsync(key) as Promise<string | null>,
        setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value) as Promise<void>,
        deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key) as Promise<void>,
      };
    })();

const TOKEN_KEY = 'taskflow_token';
const USER_KEY = 'taskflow_user';
const BIOMETRIC_KEY = 'taskflow_biometric_enabled';

let _currentToken: string | null = null;
export function getCurrentToken(): string | null {
  return _currentToken;
}

interface User {
  id: number;
  fullName: string;
  mobile: string;
  role: 'owner' | 'deputy' | 'member';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  hasSavedCredentials: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  loginWithBiometric: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    try {
      if (Platform.OS !== 'web') {
        try {
          const LocalAuth = require('expo-local-authentication');
          const compatible = await LocalAuth.hasHardwareAsync();
          const enrolled = await LocalAuth.isEnrolledAsync();
          setBiometricAvailable(compatible && enrolled);
        } catch {}
      }

      const bioPref = await storage.getItemAsync(BIOMETRIC_KEY);
      setBiometricEnabled(bioPref === 'true');

      const storedToken = await storage.getItemAsync(TOKEN_KEY);
      const storedUser = await storage.getItemAsync(USER_KEY);

      if (storedToken) {
        setHasSavedCredentials(true);
        if (bioPref !== 'true') {
          _currentToken = storedToken;
          setToken(storedToken);
          if (storedUser) {
            try { setUser(JSON.parse(storedUser)); } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Auth init error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(mobile: string, password: string) {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const res = await fetch(`https://${domain}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || 'Invalid credentials');
    }
    const data = await res.json();
    await persistAuth(data.token, data.user);
  }

  async function persistAuth(authToken: string, userData: User) {
    _currentToken = authToken;
    setToken(authToken);
    setUser(userData);
    setHasSavedCredentials(true);
    await Promise.all([
      storage.setItemAsync(TOKEN_KEY, authToken),
      storage.setItemAsync(USER_KEY, JSON.stringify(userData)),
    ]);
  }

  async function logout() {
    _currentToken = null;
    setToken(null);
    setUser(null);
    setHasSavedCredentials(false);
    setBiometricEnabled(false);
    await Promise.all([
      storage.deleteItemAsync(TOKEN_KEY),
      storage.deleteItemAsync(USER_KEY),
      storage.setItemAsync(BIOMETRIC_KEY, 'false'),
    ]);
  }

  function updateUser(userData: User) {
    setUser(userData);
    storage.setItemAsync(USER_KEY, JSON.stringify(userData)).catch(() => {});
  }

  async function enableBiometric(): Promise<boolean> {
    if (Platform.OS === 'web' || !biometricAvailable) return false;
    try {
      const LocalAuth = require('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric login',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        await storage.setItemAsync(BIOMETRIC_KEY, 'true');
        setBiometricEnabled(true);
        return true;
      }
    } catch {}
    return false;
  }

  async function disableBiometric() {
    await storage.setItemAsync(BIOMETRIC_KEY, 'false');
    setBiometricEnabled(false);
  }

  async function loginWithBiometric(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const storedToken = await storage.getItemAsync(TOKEN_KEY);
    const storedUser = await storage.getItemAsync(USER_KEY);
    if (!storedToken) return false;
    try {
      const LocalAuth = require('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Sign in to TaskFlow',
        cancelLabel: 'Use Password',
        disableDeviceFallback: false,
      });
      if (result.success) {
        _currentToken = storedToken;
        setToken(storedToken);
        if (storedUser) {
          try { setUser(JSON.parse(storedUser)); } catch {}
        }
        return true;
      }
    } catch {}
    return false;
  }

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      isAuthenticated: !!token,
      mustChangePassword: user?.mustChangePassword ?? false,
      hasSavedCredentials,
      biometricEnabled, biometricAvailable,
      login, logout, updateUser,
      enableBiometric, disableBiometric, loginWithBiometric,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
