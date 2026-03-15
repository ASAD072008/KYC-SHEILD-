import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { sendMessageToGemini } from '../services/geminiService';

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'init',
            text: "Namaste! I am your KYC Security Assistant. I can help explain why a face was rejected or guide you through the process. 🛡️",
            sender: 'ai',
            timestamp: Date.now()
        }
    ]);
    const chatBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const toggleChat = () => setIsOpen(!isOpen);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const currentInput = input.trim();
        // Clear input and set loading immediately
        setInput('');
        setIsLoading(true);

        const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString();

        const userMsg: ChatMessage = {
            id: generateId(),
            text: currentInput,
            sender: 'user',
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);

        // Call Gemini Service
        const responseText = await sendMessageToGemini(userMsg.text);

        const aiMsg: ChatMessage = {
            id: generateId(),
            text: responseText,
            sender: 'ai',
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, aiMsg]);
        
        setIsLoading(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSendMessage();
    };

    return (
        <>
            <button 
                onClick={toggleChat} 
                className={`fixed bottom-6 right-6 w-16 h-16 bg-cyber text-black rounded-full shadow-[0_0_20px_rgba(0,243,255,0.6)] flex items-center justify-center hover:scale-110 transition-transform z-50 group border-4 border-black ${isOpen ? 'hidden' : 'block'}`}
            >
                <i className="fa-solid fa-robot text-2xl"></i>
            </button>

            <div className={`fixed bottom-28 right-6 w-80 md:w-96 h-[450px] bg-black border border-cyber/30 rounded-2xl shadow-2xl z-50 flex flex-col glass-panel overflow-hidden transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}>
                
                <div className="bg-gradient-to-r from-cyber/20 to-blue-600/20 p-4 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyber flex items-center justify-center text-black font-bold">
                            <i className="fa-brands fa-google"></i>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm">Gemini Assistant</h4>
                            <span className="text-[10px] text-green-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span> Online
                            </span>
                        </div>
                    </div>
                    <button onClick={toggleChat} className="text-gray-400 hover:text-white">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div ref={chatBodyRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-black/40">
                    {messages.map((msg) => (
                        <div key={msg.id} className={msg.sender === 'user' ? "flex justify-end" : "flex items-start gap-3"}>
                            {msg.sender === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center flex-shrink-0">
                                    <i className="fa-solid fa-robot text-xs text-gray-400"></i>
                                </div>
                            )}
                            <div className={`text-sm p-3 rounded-2xl max-w-[80%] ${
                                msg.sender === 'user' 
                                    ? "bg-cyber/20 text-cyber border border-cyber/20 rounded-tr-none" 
                                    : "bg-gray-800 text-gray-200 border border-white/5 shadow-sm rounded-tl-none"
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center flex-shrink-0">
                                <i className="fa-solid fa-robot text-xs text-gray-400"></i>
                            </div>
                            <div className="bg-gray-800 text-gray-400 text-xs p-3 rounded-2xl rounded-tl-none border border-white/5">
                                Analyzing...
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-3 bg-black/60 border-t border-white/10">
                    <div className="flex items-center gap-2 bg-gray-900 rounded-lg border border-white/10 px-3 py-2 focus-within:border-cyber/50 transition">
                        <input 
                            type="text" 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Ask about deepfakes..." 
                            className="bg-transparent border-none focus:outline-none text-sm text-white flex-1 w-full placeholder-gray-500"
                            disabled={isLoading}
                        />
                        <button 
                            onClick={handleSendMessage} 
                            disabled={isLoading || !input.trim()}
                            className="text-cyber hover:text-white transition disabled:opacity-50"
                        >
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
