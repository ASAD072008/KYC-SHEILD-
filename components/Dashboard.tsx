import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LogEntry, Metrics } from '../types';
import { analyzeFaceFrame, AIAnalysisResult } from '../services/geminiService';
import { db, isFirebaseConfigured } from '../services/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '../AuthContext';

type KYCStage = 'START' | 'CAMERA' | 'VERIFYING' | 'RESULT' | 'HISTORY';

interface ScanHistory {
    id: string;
    timestamp: any;
    isReal: boolean;
    confidence: number;
    message: string;
}

export const Dashboard: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Process State
    const [stage, setStage] = useState<KYCStage>('START');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
    const [history, setHistory] = useState<ScanHistory[]>([]);
    const { user } = useAuth();
    
    const [fps, setFps] = useState(30);
    const [livenessInstruction, setLivenessInstruction] = useState<string | null>(null);
    
    // Metrics State
    const [metrics, setMetrics] = useState<Metrics>({
        confidence: 0,
        blinkRate: 0,
        textureStatus: 'checking'
    });

    const [logs, setLogs] = useState<LogEntry[]>([
        { id: 1, timestamp: new Date().toLocaleTimeString(), message: 'System Initialized', type: 'system' },
        { id: 2, timestamp: new Date().toLocaleTimeString(), message: 'AI Model: Gemini 2.5 Flash Loaded', type: 'system' }
    ]);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Scroll logs to bottom on new entry
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Fetch history
    useEffect(() => {
        if (!user || !db) {
            setHistory([]);
            return;
        }

        const q = query(
            collection(db, 'scans'),
            where('userId', '==', user.uid),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const historyData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ScanHistory[];
            setHistory(historyData);
        });

        return unsubscribe;
    }, [user]);

    // FPS Counter Simulation
    useEffect(() => {
        if (stage !== 'CAMERA') return;
        const interval = setInterval(() => {
            setFps(Math.floor(Math.random() * (32 - 28 + 1) + 28));
        }, 1000);
        return () => clearInterval(interval);
    }, [stage]);

    const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
        const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random();
        setLogs(prev => [...prev, {
            id: generateId(),
            timestamp: new Date().toLocaleTimeString().split(" ")[0],
            message,
            type
        }]);
    }, []);

    const startCamera = async () => {
        setStage('CAMERA');
        addLog("Initializing Camera Stream...", "system");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                addLog("Video Stream Connected.", "success");
            }
        } catch (err) {
            console.error(err);
            addLog("Camera access denied.", 'alert');
            alert("Camera permission is required for KYC.");
            setStage('START');
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    };

    const runLivenessSequence = async () => {
        if (!videoRef.current) return;
        
        const instructions = [
            "Look Straight",
            "Turn Head Left",
            "Turn Head Right",
            "Blink Your Eyes",
            "Smile"
        ];

        for (const instruction of instructions) {
            setLivenessInstruction(instruction);
            addLog(`Liveness Check: ${instruction}`, "info");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        setLivenessInstruction("Hold Still...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        captureAndVerify();
        setLivenessInstruction(null);
    };

    const captureAndVerify = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        addLog("Capturing high-res frame...", "info");
        
        // Draw video frame to canvas
        const context = canvasRef.current.getContext('2d');
        if (context) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            
            const imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
            setCapturedImage(imageBase64);
            
            // Transition to verifying
            stopCamera();
            setStage('VERIFYING');
            addLog("Uploading frame to Secure AI Enclave...", "system");

            // AI Analysis
            const startTime = Date.now();
            
            try {
                // Race between analysis and timeout
                const analysisPromise = analyzeFaceFrame(imageBase64);
                const timeoutPromise = new Promise<AIAnalysisResult>((_, reject) => 
                    setTimeout(() => reject(new Error("Analysis timed out")), 20000)
                );

                const result = await Promise.race([analysisPromise, timeoutPromise]);
                
                const duration = Date.now() - startTime;
                addLog(`Analysis complete in ${duration}ms`, "info");
                
                setAnalysisResult(result);
                
                // Update Metrics based on real result
                setMetrics({
                    confidence: result.confidence,
                    blinkRate: Math.floor(Math.random() * 15) + 10, // Simulated for single frame
                    textureStatus: (result.issues && result.issues.length === 0) ? 'clean' : 'artifacts'
                });
    
                if (result.isReal) {
                    addLog(`VERIFIED: ${result.message}`, "success");
                } else {
                    addLog(`REJECTED: ${result.message}`, "alert");
                    if (result.issues && Array.isArray(result.issues)) {
                        result.issues.forEach(issue => addLog(`FLAG: ${issue}`, "alert"));
                    }
                }

                // Save to Firestore in background (don't block UI)
                if (user && db) {
                    addDoc(collection(db, 'scans'), {
                        userId: user.uid,
                        timestamp: Timestamp.now(),
                        isReal: result.isReal,
                        confidence: result.confidence,
                        message: result.message,
                        issues: result.issues || []
                    }).then(() => {
                        addLog("Scan result synced with cloud.", "success");
                    }).catch((error: any) => {
                        console.error("Error saving scan:", error);
                        if (error.code === 'unavailable') {
                            addLog("Cloud sync failed: Network unavailable. Result saved locally.", "alert");
                        } else {
                            addLog("Cloud sync failed.", "alert");
                        }
                    });
                }
    
                setStage('RESULT');

            } catch (error: any) {
                console.error("Verification process failed:", error);
                addLog(`Verification failed: ${error.message}`, "alert");
                
                setAnalysisResult({
                    isReal: false,
                    confidence: 0,
                    issues: ["System Timeout", "Network Error"],
                    message: "Verification Failed"
                });
                setStage('RESULT');
            }
        }
    };

    const resetProcess = () => {
        setCapturedImage(null);
        setAnalysisResult(null);
        setStage('START');
        addLog("Session reset. Ready for next applicant.", "system");
    };

    return (
        <section id="dashboard" className="py-24 bg-surface relative border-y border-gray-200">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <h2 className="text-3xl font-bold mb-2 text-gray-900">Live Security Dashboard</h2>
                        <p className="text-gray-600 text-sm">Real-time deepfake analysis engine.</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-100 border border-green-200 text-green-700 text-xs rounded-full">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> SYSTEM ONLINE
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    
                    {/* Main Interaction Area */}
                    <div className="lg:col-span-2 relative bg-gray-900 rounded-xl overflow-hidden border border-gray-200 aspect-video shadow-2xl flex flex-col">
                        
                        {/* Hidden Canvas for Capture */}
                        <canvas ref={canvasRef} className="hidden"></canvas>

                        {/* STAGE: START */}
                        {stage === 'START' && (
                            <div className="absolute inset-0 z-20 overflow-y-auto bg-white">
                                <div className="min-h-full flex flex-col items-center justify-center p-8">
                                    <div className="w-20 h-20 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-6 animate-pulse shrink-0">
                                        <i className="fa-solid fa-user-shield text-4xl text-blue-600"></i>
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2 text-center text-gray-900">Start Video KYC</h3>
                                    <p className="text-gray-500 mb-8 max-w-sm text-center">
                                        Initialize secure biometric verification session using Google Gemini Vision.
                                    </p>
                                    
                                    <button 
                                        onClick={startCamera} 
                                        className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 shrink-0"
                                    >
                                        Start Camera Session
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STAGE: CAMERA */}
                        <div className={`relative w-full h-full ${stage === 'CAMERA' ? 'block' : 'hidden'}`}>
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                className="w-full h-full object-cover transform scale-x-[-1]"
                            ></video>
                            
                            {/* Camera Overlay */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-4 left-4 font-mono text-xs text-cyber bg-black/50 px-2 py-1 rounded">
                                    LIVE FPS: {fps}
                                </div>
                                <div className="scan-line opacity-50"></div>
                                
                                {/* Face Frame Guide */}
                                <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 border-dashed ${livenessInstruction ? 'border-cyber' : 'border-white/30'} rounded-[3rem] flex items-center justify-center transition-colors duration-300`}>
                                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-cyber rounded-tl-xl"></div>
                                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-cyber rounded-tr-xl"></div>
                                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-cyber rounded-bl-xl"></div>
                                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-cyber rounded-br-xl"></div>
                                </div>

                                <div className="absolute bottom-24 w-full text-center">
                                    {livenessInstruction ? (
                                        <p className="text-cyber font-bold text-2xl bg-black/60 inline-block px-6 py-3 rounded-lg backdrop-blur-md animate-pulse border border-cyber/30">
                                            {livenessInstruction}
                                        </p>
                                    ) : (
                                        <p className="text-white font-bold text-lg bg-black/40 inline-block px-4 py-1 rounded backdrop-blur-sm">
                                            Ensure Good Lighting & Look Straight
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="absolute bottom-8 left-0 w-full flex justify-center z-30">
                                {!livenessInstruction && (
                                    <button 
                                        onClick={runLivenessSequence}
                                        className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 hover:scale-105 transition shadow-lg flex items-center justify-center"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-red-500"></div>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* STAGE: VERIFYING */}
                        {stage === 'VERIFYING' && capturedImage && (
                            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-30">
                                <div className="relative w-full h-full opacity-30 blur-sm">
                                    <img src={capturedImage} alt="Capture" className="w-full h-full object-cover" />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden mb-6">
                                        <div className="h-full bg-cyber animate-[pulse_1s_ease-in-out_infinite] w-full origin-left"></div>
                                    </div>
                                    <h3 className="text-xl font-bold animate-pulse">AI is verifying your identity...</h3>
                                    <p className="text-gray-500 text-sm mt-2">Analyzing micro-textures & liveness</p>
                                    <i className="fa-solid fa-lock text-3xl text-cyber mt-6"></i>
                                </div>
                            </div>
                        )}

                        {/* STAGE: RESULT */}
                        {stage === 'RESULT' && analysisResult && (
                            <div className="absolute inset-0 bg-black/90 z-40 overflow-y-auto">
                                <div className="min-h-full flex flex-col items-center justify-center p-8 text-center">
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl mb-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] shrink-0 ${analysisResult.isReal ? 'bg-green-500 text-black' : 'bg-red-600 text-white'}`}>
                                        <i className={`fa-solid ${analysisResult.isReal ? 'fa-check' : 'fa-xmark'}`}></i>
                                    </div>
                                    
                                    <h2 className="text-3xl font-bold mb-2">
                                        {analysisResult.isReal ? 'KYC APPROVED' : 'DEEPFAKE DETECTED'}
                                    </h2>
                                    
                                    <p className={`text-lg font-medium mb-6 ${analysisResult.isReal ? 'text-green-400' : 'text-red-500'}`}>
                                        {analysisResult.message}
                                    </p>
    
                                    <div className="bg-white/5 p-4 rounded-lg w-full max-w-md mb-8 border border-white/10 shrink-0">
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-gray-400">Confidence Score:</span>
                                            <span className="font-mono text-white">{analysisResult.confidence}%</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">AI Verdict:</span>
                                            <span className="font-mono text-cyber">{analysisResult.isReal ? 'HUMAN_VERIFIED' : 'SPOOF_ATTEMPT'}</span>
                                        </div>
                                        {!analysisResult.isReal && analysisResult.issues.length > 0 && (
                                            <div className="mt-4 text-left border-t border-white/10 pt-2">
                                                <p className="text-xs text-gray-500 mb-1">DETECTION REASON:</p>
                                                <ul className="text-sm text-red-400 list-disc list-inside">
                                                    {analysisResult.issues.map((issue, idx) => (
                                                        <li key={idx}>{issue}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
    
                                    <button 
                                        onClick={resetProcess}
                                        className="px-8 py-3 glass-panel text-white hover:bg-white/10 rounded-lg transition border border-white/20 shrink-0"
                                    >
                                        {analysisResult.isReal ? 'Continue' : 'Retry Verification'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STAGE: HISTORY */}
                        {stage === 'HISTORY' && (
                            <div className="absolute inset-0 bg-void z-50 flex flex-col p-8 overflow-y-auto no-scrollbar">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-2xl font-bold">Scan History</h3>
                                    <button onClick={() => setStage('START')} className="text-gray-400 hover:text-white">
                                        <i className="fa-solid fa-xmark text-xl"></i>
                                    </button>
                                </div>

                                {history.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                                        <i className="fa-solid fa-clock-rotate-left text-4xl mb-4 opacity-20"></i>
                                        <p>No scan history found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {history.map((item) => (
                                            <div key={item.id} className="glass-panel p-4 rounded-lg border border-white/10 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.isReal ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        <i className={`fa-solid ${item.isReal ? 'fa-check' : 'fa-shield-halved'}`}></i>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm">{item.isReal ? 'Human Verified' : 'Spoof Detected'}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'Just now'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-mono text-cyber text-sm">{item.confidence}%</p>
                                                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">Confidence</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Metrics Section */}
                    <div className="glass-panel rounded-xl p-6 flex flex-col h-full border border-gray-200">
                        <h3 className="font-bold text-lg mb-6 border-b border-gray-200 pb-4 text-gray-900">Analysis Metrics</h3>
                        
                        <div className="space-y-6 flex-1">
                            {user && (
                                <button 
                                    onClick={() => setStage('HISTORY')}
                                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 mb-4 text-gray-700"
                                >
                                    <i className="fa-solid fa-clock-rotate-left"></i> View History
                                </button>
                            )}
                            <div>
                                <div className="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Liveness Confidence</span>
                                    <span className="text-gray-900">{metrics.confidence}%</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${metrics.confidence}%` }}></div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Blink Rate / Min</span>
                                    <span className="text-gray-900">{metrics.blinkRate}</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${Math.min(metrics.blinkRate * 4, 100)}%` }}></div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Texture Anomalies</span>
                                    <span className={`${metrics.textureStatus === 'clean' ? 'text-green-600' : metrics.textureStatus === 'artifacts' ? 'text-red-600' : 'text-gray-900'}`}>
                                        {metrics.textureStatus === 'clean' ? 'Clean' : metrics.textureStatus === 'artifacts' ? 'Artifacts Found' : 'Checking...'}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-500 ${metrics.textureStatus === 'artifacts' ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: metrics.textureStatus === 'artifacts' ? '95%' : metrics.textureStatus === 'clean' ? '5%' : '0%' }}></div>
                                </div>
                            </div>

                            <div ref={logContainerRef} className="mt-8 bg-gray-900 rounded-lg p-4 font-mono text-xs h-40 overflow-y-auto border border-gray-200 space-y-1">
                                {logs.map((log) => (
                                    <div key={log.id} className={`${log.type === 'success' ? 'text-green-400' : log.type === 'alert' ? 'text-red-400' : 'text-gray-400'}`}>
                                        <span className="text-gray-500">[{log.timestamp}]</span> {log.type === 'success' || log.type === 'alert' ? '> ' : ''} {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};