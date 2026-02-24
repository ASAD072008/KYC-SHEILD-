import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isConfigured: boolean;
  configError: string | null;
  dismissError: () => void;
  isLoggingIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Validate Configuration on Mount
    const appId = import.meta.env.VITE_FIREBASE_APP_ID;
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    
    console.log("Firebase Config Check:", {
      appId: appId ? `${appId.substring(0, 5)}...` : "MISSING",
      apiKey: apiKey ? `${apiKey.substring(0, 5)}...` : "MISSING",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
    });

    if (appId && !appId.startsWith('1:')) {
      setConfigError("Invalid Firebase App ID detected. It should start with '1:'. You likely used the Measurement ID (G-...) instead.");
    }

    if (!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) {
      setConfigError("Missing VITE_FIREBASE_AUTH_DOMAIN. Please add it to your .env file.");
    }

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setConfigError("Missing VITE_FIREBASE_PROJECT_ID. Please add it to your .env file.");
    }

    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const dismissError = () => setConfigError(null);

  const login = async () => {
    if (isLoggingIn) return;
    
    if (configError) {
      // Don't alert, just let the UI show the error
      return;
    }
    
    if (!auth) {
      setConfigError("Firebase is not configured. Please add your API keys.");
      return;
    }

    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Force account selection to avoid auto-sign-in loops

    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Handle Popup Closed / Cancelled (Benign)
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        console.log("User cancelled login popup.");
        return; 
      }

      console.error("Login failed", error);

      // Handle Popup Blocked
      if (error.code === 'auth/popup-blocked') {
        setConfigError("Login popup was blocked by your browser. Please allow popups for this site and try again.");
        return;
      }

      // Handle Internal Assertion Error (Race Condition)
      if (error.message && error.message.includes("INTERNAL ASSERTION FAILED")) {
        console.warn("Firebase internal assertion failed. Retrying might fix this.");
        // This is often transient. We won't show a scary error to the user, maybe just log it.
        return; 
      }

      if (error.code === 'auth/configuration-not-found') {
        const msg = "Login failed: Google Sign-In is not enabled. Go to Firebase Console -> Authentication -> Sign-in method -> Add new provider -> Google -> Enable.";
        setConfigError(msg);
      } else if (error.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key') {
        const msg = "Login failed: Invalid API Key. Please check your .env file.";
        setConfigError(msg);
      } else if (error.code === 'auth/operation-not-allowed') {
        const msg = "Login failed: Google Sign-In is not enabled in the Firebase Console.";
        setConfigError(msg);
      } else if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        const msg = `Login failed: Domain "${domain}" is not authorized. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains and add "${domain}".`;
        setConfigError(msg);
      } else {
        setConfigError(`Login failed: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isConfigured: isFirebaseConfigured, configError, dismissError, isLoggingIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
