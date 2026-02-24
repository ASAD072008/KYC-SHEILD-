import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer id="team" className="py-12 border-t border-white/5 bg-void text-center">
        <div className="max-w-4xl mx-auto px-6 mb-10">
            <h3 className="text-cyber font-mono text-xs mb-6 tracking-[0.2em] uppercase opacity-80">Project Team</h3>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-gray-400 text-sm font-medium">
                <span className="hover:text-white transition-colors cursor-default">Asad Mujawar</span>
                <span className="hover:text-white transition-colors cursor-default">Sakshi Vadgave</span>
                <span className="hover:text-white transition-colors cursor-default">Shreya Patil</span>
                <span className="hover:text-white transition-colors cursor-default">Atharv Suryavanshi</span>
            </div>
        </div>
        <div className="border-t border-white/5 pt-8 max-w-xs mx-auto">
            <p className="text-gray-600 text-xs">
                &copy; 2026 GSA India Tech Summit.<br/>Powered by <span className="text-cyber">Google Gemini</span>
            </p>
        </div>
    </footer>
  );
};