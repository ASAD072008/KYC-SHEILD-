import React, { useState } from 'react';

export const Hero: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <header id="features" className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-grid">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyber/20 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
            <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyber/30 bg-cyber/5 text-cyber text-xs font-mono mb-8">
                    <span className="flex h-2 w-2 rounded-full bg-cyber animate-pulse"></span>
                    GSA INDIA TECH SUMMIT 2026
                </div>
                <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 text-gray-900">
                    Identity Theft <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyber to-blue-600">Ends Here.</span>
                </h1>
                <p className="text-lg text-gray-600 mb-10 max-w-lg leading-relaxed">
                    The first real-time Deepfake Detection Shield for Indian FinTech. Powered by Google Gemini & MediaPipe.
                </p>
                <div className="flex flex-wrap gap-4">
                    <a href="#dashboard" className="px-8 py-4 bg-cyber text-white font-bold rounded-lg hover:bg-blue-600 transition shadow-lg shadow-blue-500/30 flex items-center gap-2">
                        <i className="fa-solid fa-radar"></i> Launch Dashboard
                    </a>
                    <button onClick={openModal} className="px-8 py-4 glass-panel text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition flex items-center gap-2 border border-gray-200">
                        <i className="fa-solid fa-play"></i> Watch Demo
                    </button>
                </div>
            </div>

            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-purple-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                
                <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                    {/* Window Header */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500/20"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-500/20"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500/20"></div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-white px-3 py-1 rounded-md border border-gray-200 shadow-sm">
                            <i className="fa-solid fa-shield-halved text-blue-500"></i>
                            <span>Live Security Monitor</span>
                        </div>
                        <div className="text-xs text-gray-400 font-medium">System Active</div>
                    </div>

                    {/* Content */}
                    <div className="p-6 font-sans text-sm space-y-4 bg-white">
                        {/* System Stats */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <div className="text-xs text-blue-600 mb-1 font-semibold">ANALYSIS SPEED</div>
                                <div className="text-2xl font-bold text-blue-900">Real-time</div>
                                <div className="w-full bg-blue-200 h-1 mt-2 rounded-full overflow-hidden">
                                    <div className="bg-blue-500 h-full w-[92%] animate-pulse"></div>
                                </div>
                            </div>
                            <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                <div className="text-xs text-purple-600 mb-1 font-semibold">AI CONFIDENCE</div>
                                <div className="text-2xl font-bold text-purple-900">99.8%</div>
                                <div className="w-full bg-purple-200 h-1 mt-2 rounded-full overflow-hidden">
                                    <div className="bg-purple-500 h-full w-[99%]"></div>
                                </div>
                            </div>
                        </div>

                        {/* User Friendly Steps */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-2 rounded-lg bg-green-50 border border-green-100">
                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                    <i className="fa-solid fa-check text-green-600 text-xs"></i>
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900">Biometric Scan Initialized</p>
                                    <p className="text-xs text-gray-500">Camera feed connected securely</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 border border-blue-100">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900">Analyzing Facial Features</p>
                                    <p className="text-xs text-gray-500">Checking for natural movement & blinking</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100 opacity-60">
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                                    <i className="fa-solid fa-hourglass text-gray-400 text-xs"></i>
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900">Deepfake Detection</p>
                                    <p className="text-xs text-gray-500">Scanning for artificial artifacts</p>
                                </div>
                            </div>
                        </div>

                        {/* Activity Log */}
                        <div className="mt-6 bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300 shadow-inner">
                            <div className="flex items-center gap-2 mb-2 border-b border-gray-700 pb-2">
                                <i className="fa-solid fa-list-ul text-gray-500"></i>
                                <span className="text-gray-500">Live Activity Feed</span>
                            </div>
                            <div className="space-y-1.5">
                                <p className="flex items-center gap-2">
                                    <span className="text-green-400">●</span> 
                                    <span>System ready for verification</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <span className="text-blue-400">●</span> 
                                    <span>Secure connection established</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <span className="text-yellow-400">●</span> 
                                    <span>Waiting for user input...</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Video Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={closeModal}>
                <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden border border-white/20 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={closeModal}
                        className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="https://www.youtube.com/embed/JXp6y8SHECg?autoplay=1" 
                        title="Demo Video" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                    ></iframe>
                </div>
            </div>
        )}
    </header>
  );
};
