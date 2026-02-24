import React from 'react';
import { useAuth } from '../AuthContext';

export const Navbar: React.FC = () => {
  const { user, login, logout, isLoggingIn } = useAuth();

  return (
    <nav className="fixed top-0 left-0 w-full z-50 glass-panel border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between h-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-cyber/10 rounded-lg flex items-center justify-center border border-cyber/30">
                        <i className="fa-solid fa-shield-cat text-cyber text-xl"></i>
                    </div>
                    <span className="font-bold text-xl tracking-wider text-gray-900">KYC <span className="text-cyber">SHIELD</span></span>
                </div>
                <div className="hidden md:flex items-center gap-8">
                    <a href="#features" className="text-gray-600 hover:text-black transition text-sm font-medium">Features</a>
                    <a href="#dashboard" className="text-gray-600 hover:text-black transition text-sm font-medium">Live Dashboard</a>
                    
                    {user ? (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-cyber/50" />
                                <span className="text-sm font-medium text-gray-700">{user.displayName}</span>
                            </div>
                            <button 
                                onClick={logout}
                                className="px-4 py-2 bg-alert/10 hover:bg-alert/20 border border-alert/30 rounded-lg text-xs font-bold text-alert transition uppercase tracking-widest"
                            >
                                Logout
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={login}
                            disabled={isLoggingIn}
                            className={`px-5 py-2.5 bg-cyber/10 hover:bg-cyber/20 border border-cyber/30 rounded-lg text-sm font-bold text-cyber transition flex items-center gap-2 ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isLoggingIn ? (
                                <><i className="fa-solid fa-circle-notch fa-spin"></i> Logging in...</>
                            ) : (
                                <><i className="fa-solid fa-right-to-bracket"></i> Login</>
                            )}
                        </button>
                    )}

                    <a href="https://github.com" target="_blank" rel="noreferrer" className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition flex items-center gap-2">
                        <i className="fa-brands fa-github"></i> Source Code
                    </a>
                </div>
            </div>
        </div>
    </nav>
  );
};
