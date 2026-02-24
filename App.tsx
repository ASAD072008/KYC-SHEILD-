import React from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Dashboard } from './components/Dashboard';
import { ChatWidget } from './components/ChatWidget';
import { Footer } from './components/Footer';
import { AuthProvider, useAuth } from './AuthContext';

const ConfigErrorBanner: React.FC = () => {
  const { configError, dismissError } = useAuth();
  if (!configError) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-red-600/90 backdrop-blur-md text-white px-4 py-3 rounded-lg shadow-2xl z-[100] border border-red-500 animate-slide-in-right flex items-start gap-3">
      <i className="fa-solid fa-triangle-exclamation mt-1 shrink-0"></i>
      <div className="flex-1 text-sm">
        {configError}
      </div>
      <button onClick={dismissError} className="text-white/70 hover:text-white transition">
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

const AppContent: React.FC = () => {
    return (
        <div className="min-h-screen bg-void text-white relative">
            <Navbar />
            <main>
                <Hero />
                <Dashboard />
            </main>
            <ChatWidget />
            <ConfigErrorBanner />
            <Footer />
        </div>
    );
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
