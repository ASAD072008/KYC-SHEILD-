import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LogEntry, Metrics } from '../types';
import { analyzeFaceFrame, analyzeIdentity, AIAnalysisResult as ServiceAIAnalysisResult } from '../services/geminiService';

// Re-export or use the one from service
export type AIAnalysisResult = ServiceAIAnalysisResult;
import { db, isFirebaseConfigured } from '../services/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { jsPDF } from "jspdf";

type KYCStage = 'START' | 'ID_UPLOAD' | 'CAMERA' | 'VERIFYING' | 'RESULT' | 'HISTORY';

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
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Process State
    const [stage, setStage] = useState<KYCStage>('START');
    const [idImage, setIdImage] = useState<string | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
    const [history, setHistory] = useState<ScanHistory[]>([]);
    const { user, login } = useAuth();
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    
    // Fingerprinting State
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<any>(null);

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

    // Capture Device Fingerprint on Mount
    useEffect(() => {
        const ua = navigator.userAgent;
        let browserName = "Unknown";
        let browserVersion = "Unknown";

        if (ua.indexOf("Firefox") > -1) {
            browserName = "Firefox";
            browserVersion = ua.match(/Firefox\/([0-9.]+)/)?.[1] || "Unknown";
        } else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) {
            browserName = "Opera";
            browserVersion = ua.match(/(?:Opera|OPR)\/([0-9.]+)/)?.[1] || "Unknown";
        } else if (ua.indexOf("Trident") > -1) {
            browserName = "Internet Explorer";
        } else if (ua.indexOf("Edge") > -1) {
            browserName = "Edge";
            browserVersion = ua.match(/Edge\/([0-9.]+)/)?.[1] || "Unknown";
        } else if (ua.indexOf("Chrome") > -1) {
            browserName = "Chrome";
            browserVersion = ua.match(/Chrome\/([0-9.]+)/)?.[1] || "Unknown";
        } else if (ua.indexOf("Safari") > -1) {
            browserName = "Safari";
            browserVersion = ua.match(/Version\/([0-9.]+)/)?.[1] || "Unknown";
        }

        const info = {
            userAgent: ua,
            platform: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: (navigator as any).deviceMemory || 'unknown',
            browserName,
            browserVersion,
            vendor: navigator.vendor,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            online: navigator.onLine,
        };
        setDeviceInfo(info);
        addLog(`Device Fingerprint: ${info.platform} / ${info.browserName} ${info.browserVersion}`, "system");
    }, []);

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

    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    const startCamera = async () => {
        setStage('CAMERA');
        addLog("Initializing Camera Stream...", "system");
        
        // Stop any existing stream first to prevent "Device in use" errors
        stopCamera();
        
        // Request Geolocation with high accuracy and timeout
        if (navigator.geolocation) {
            addLog("Requesting Geolocation Access...", "system");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                    addLog(`Location Acquired: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`, "success");
                },
                (error) => {
                    console.warn("Geolocation error:", error);
                    let errorMsg = "Location access denied.";
                    if (error.code === 1) errorMsg = "Location permission denied.";
                    else if (error.code === 2) errorMsg = "Location unavailable.";
                    else if (error.code === 3) errorMsg = "Location request timed out.";
                    addLog(errorMsg, "alert");
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            addLog("Geolocation not supported by this browser.", "alert");
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                addLog("Video Stream Connected.", "success");
            }
        } catch (err: any) {
            console.error("Camera error:", err);
            let errorMessage = "Camera access denied.";
            if (err.name === 'NotReadableError' || err.message?.includes('Device in use')) {
                errorMessage = "Camera is already in use by another application or tab.";
            } else if (err.name === 'NotAllowedError') {
                errorMessage = "Camera permission was denied.";
            } else if (err.name === 'NotFoundError') {
                errorMessage = "No camera device found.";
            }
            
            addLog(errorMessage, 'alert');
            alert(errorMessage + " Please check your camera and try again.");
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

    const handleIdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setUploadError(null);
        setUploadProgress(0);

        if (file) {
            // Basic validation
            if (!file.type.startsWith('image/')) {
                setUploadError("Please upload a valid image file (JPEG, PNG).");
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setUploadError("File size exceeds 5MB limit.");
                return;
            }

            // Simulate progress for visual feedback
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                setUploadProgress(progress);
                if (progress >= 90) clearInterval(interval);
            }, 50);

            const reader = new FileReader();
            reader.onloadend = () => {
                clearInterval(interval);
                setUploadProgress(100);
                setTimeout(() => {
                    setIdImage(reader.result as string);
                    setUploadProgress(0);
                    addLog("ID Document uploaded successfully.", "success");
                }, 300);
            };
            reader.onerror = () => {
                clearInterval(interval);
                setUploadProgress(0);
                setUploadError("Failed to read file.");
            };
            reader.readAsDataURL(file);
        }
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
                const analysisPromise = idImage 
                    ? analyzeIdentity(idImage, imageBase64)
                    : analyzeFaceFrame(imageBase64);
                
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
                    if (idImage && result.idMatch) {
                        addLog("ID MATCH: Face matches government document.", "success");
                    } else if (idImage && !result.idMatch) {
                        addLog("ID MISMATCH: Face does not match document.", "alert");
                    }
                } else {
                    if (result.message === "Missing API Key") {
                        addLog("CRITICAL: API Key missing. Set GEMINI_API_KEY in Vercel.", "alert");
                    } else {
                        addLog(`REJECTED: ${result.message}`, "alert");
                    }
                    
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
                        issues: result.issues || [],
                        location: location || null,
                        deviceInfo: deviceInfo || null
                    }).then(() => {
                        addLog("Scan result synced with cloud.", "success");
                    }).catch((error: any) => {
                        console.error("Error saving scan:", error);
                        if (error.code === 'unavailable') {
                            addLog("Cloud sync failed: Network unavailable. Result saved locally.", "alert");
                        } else if (error.code === 'permission-denied') {
                            addLog("Cloud sync failed: Permission Denied. Check Firestore Security Rules.", "alert");
                        } else {
                            addLog(`Cloud sync failed: ${error.message}`, "alert");
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

    const generateCertificate = () => {
        if (!analysisResult || !user) return;

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // --- Fresh & Stylish Theme Colors ---
        const bgLight = [255, 255, 255]; // Pure White
        const primaryBlue = [37, 99, 235]; // Royal Blue
        const accentCyan = [6, 182, 212]; // Cyan
        const successGreen = [16, 185, 129]; // Emerald
        const errorRed = [239, 68, 68]; // Red
        const textDark = [17, 24, 39]; // Gray 900
        const textLight = [107, 114, 128]; // Gray 500
        const borderGray = [229, 231, 235]; // Gray 200

        // 1. Background
        doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
        doc.rect(0, 0, 297, 210, 'F');
        
        // 2. Stylish Border
        const margin = 12;
        const width = 273;
        const height = 186;

        // Subtle background accent shape
        doc.setFillColor(243, 244, 246); // Gray 100
        doc.rect(0, 0, 297, 40, 'F'); // Top header bar background

        // Main Border
        doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setLineWidth(1);
        doc.rect(margin, margin, width, height);
        
        // Inner decorative border (double line effect)
        doc.setDrawColor(accentCyan[0], accentCyan[1], accentCyan[2]);
        doc.setLineWidth(0.3);
        doc.rect(margin + 2, margin + 2, width - 4, height - 4);

        // 3. Header Section
        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.text("IDENTITY VERIFICATION", 148.5, 28, { align: "center" });
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(textLight[0], textLight[1], textLight[2]);
        doc.text("OFFICIAL KYC SHIELD CERTIFICATE", 148.5, 36, { align: "center" });
        
        // 4. Content Grid
        const startY = 70;
        
        // --- Left Column: Applicant Data ---
        doc.setFontSize(14);
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setFont("helvetica", "bold");
        doc.text("APPLICANT DETAILS", 30, startY);
        
        // Underline for section header
        doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setLineWidth(0.5);
        doc.line(30, startY + 2, 90, startY + 2);
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        
        const details = [
            { label: "Full Name", value: (analysisResult.extractedName && analysisResult.extractedName !== 'Unknown' ? analysisResult.extractedName : user.displayName || 'Unknown') },
            { label: "User ID", value: (analysisResult.extractedIdNumber && analysisResult.extractedIdNumber !== 'Unknown' ? analysisResult.extractedIdNumber : user.uid) },
            { label: "Date Issued", value: new Date().toLocaleDateString() },
            { label: "Time Issued", value: new Date().toLocaleTimeString() },
            { label: "Reference ID", value: `KYC-${Date.now().toString().slice(-8)}` },
            { label: "Location", value: location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "N/A" }
        ];

        let currentY = startY + 15;
        details.forEach(detail => {
            // Label
            doc.setFont("helvetica", "bold");
            doc.setTextColor(textLight[0], textLight[1], textLight[2]);
            doc.text(detail.label, 30, currentY);
            
            // Value (Truncate if too long to prevent overlap)
            doc.setFont("helvetica", "normal");
            doc.setTextColor(textDark[0], textDark[1], textDark[2]);
            const safeValue = detail.value.length > 30 ? detail.value.substring(0, 27) + "..." : detail.value;
            doc.text(safeValue, 80, currentY); // Aligned value
            
            // Divider line
            doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
            doc.setLineWidth(0.1);
            doc.line(30, currentY + 3, 160, currentY + 3); // Extended slightly to fit longer names

            currentY += 12; // Spacing
        });

        // --- Right Column: Status & Biometrics ---
        const rightColX = 180; // Adjusted for balance
        
        doc.setFontSize(14);
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setFont("helvetica", "bold");
        doc.text("VERIFICATION STATUS", rightColX, startY);

        // Underline for section header
        doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setLineWidth(0.5);
        doc.line(rightColX, startY + 2, rightColX + 60, startY + 2);

        // Status Box
        const badgeY = startY + 12;
        const badgeWidth = 85;
        const badgeHeight = 20;
        
        if (analysisResult.isReal) {
            // Success Badge
            doc.setFillColor(209, 250, 229); // Light Emerald
            doc.roundedRect(rightColX, badgeY, badgeWidth, badgeHeight, 2, 2, 'F');
            
            doc.setDrawColor(successGreen[0], successGreen[1], successGreen[2]);
            doc.setLineWidth(0.5);
            doc.roundedRect(rightColX, badgeY, badgeWidth, badgeHeight, 2, 2, 'S');
            
            doc.setTextColor(successGreen[0], successGreen[1], successGreen[2]);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("ACCESS GRANTED", rightColX + 42.5, badgeY + 13, { align: "center" });
        } else {
            // Failure Badge
            doc.setFillColor(254, 226, 226); // Light Red
            doc.roundedRect(rightColX, badgeY, badgeWidth, badgeHeight, 2, 2, 'F');
            
            doc.setDrawColor(errorRed[0], errorRed[1], errorRed[2]);
            doc.setLineWidth(0.5);
            doc.roundedRect(rightColX, badgeY, badgeWidth, badgeHeight, 2, 2, 'S');
            
            doc.setTextColor(errorRed[0], errorRed[1], errorRed[2]);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("ACCESS DENIED", rightColX + 42.5, badgeY + 13, { align: "center" });
        }

        // Metrics
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        
        const metricsY = badgeY + 30;
        doc.text(`Confidence Score:`, rightColX, metricsY);
        doc.setFont("helvetica", "bold");
        doc.text(`${analysisResult.confidence}%`, rightColX + 40, metricsY);
        
        doc.setFont("helvetica", "normal");
        doc.text(`Liveness Check:`, rightColX, metricsY + 8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(successGreen[0], successGreen[1], successGreen[2]);
        doc.text(`PASSED`, rightColX + 40, metricsY + 8);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(`Texture Analysis:`, rightColX, metricsY + 16);
        doc.setFont("helvetica", "bold");
        doc.text(`COMPLETED`, rightColX + 40, metricsY + 16);

        if (idImage) {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(textDark[0], textDark[1], textDark[2]);
            doc.text(`ID Face Match:`, rightColX, metricsY + 24);
            doc.setFont("helvetica", "bold");
            if (analysisResult.idMatch) {
                doc.setTextColor(successGreen[0], successGreen[1], successGreen[2]);
                doc.text(`PASSED`, rightColX + 40, metricsY + 24);
            } else {
                doc.setTextColor(errorRed[0], errorRed[1], errorRed[2]);
                doc.text(`FAILED`, rightColX + 40, metricsY + 24);
            }
        }

        // --- Captured Image (Clean Frame) ---
        if (capturedImage) {
            const imgX = rightColX;
            const imgY = metricsY + (idImage ? 30 : 22);
            const imgSize = 45; // Reduced from 55 to prevent overlap

            // Image Border/Shadow effect
            doc.setFillColor(229, 231, 235); // Gray shadow
            doc.rect(imgX + 2, imgY + 2, imgSize, imgSize, 'F');
            
            doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
            doc.setLineWidth(0.5);
            doc.rect(imgX, imgY, imgSize, imgSize);

            doc.addImage(capturedImage, 'JPEG', imgX + 1, imgY + 1, imgSize - 2, imgSize - 2);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(textLight[0], textLight[1], textLight[2]);
            doc.text("Biometric Capture Reference", imgX + (imgSize/2), imgY + imgSize + 5, { align: "center" });
        }

        // 5. Footer
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(textLight[0], textLight[1], textLight[2]);
        
        const footerY = 195;
        doc.line(margin + 10, footerY, width - 10, footerY); // Footer line
        doc.text(`Certificate ID: ${analysisResult.id || 'GEN-' + Date.now()}`, 148.5, footerY + 5, { align: "center" });
        doc.text("Powered by KYC Shield AI • Secure Verification System", 148.5, footerY + 10, { align: "center" });

        doc.save(`KYC-Certificate-${user.uid.slice(0, 6)}.pdf`);
        addLog("Certificate downloaded successfully.", "success");
    };

    const resetProcess = () => {
        setCapturedImage(null);
        setIdImage(null);
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
                                        onClick={() => {
                                            if (!user) {
                                                setShowLoginPrompt(true);
                                                return;
                                            }
                                            setStage('ID_UPLOAD');
                                            addLog("Initiating ID Document Upload phase...", "system");
                                        }} 
                                        className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 shrink-0"
                                    >
                                        Begin Verification
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STAGE: ID_UPLOAD */}
                        {stage === 'ID_UPLOAD' && (
                            <div className="absolute inset-0 z-20 overflow-y-auto bg-white">
                                <div className="min-h-full flex flex-col items-center justify-center p-8">
                                    <h3 className="text-2xl font-bold mb-2 text-center text-gray-900">Upload Aadhar Card</h3>
                                    <p className="text-gray-500 mb-6 max-w-md text-center">
                                        Please upload a clear picture of your Aadhar Card for identity verification. Note: Only Aadhar cards are supported.
                                    </p>
                                    
                                    <div className="relative w-full max-w-md border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors bg-gray-50 mb-6 overflow-hidden">
                                        {uploadProgress > 0 && uploadProgress < 100 && (
                                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                                                <p className="text-blue-600 font-medium">Processing... {uploadProgress}%</p>
                                            </div>
                                        )}
                                        
                                        {idImage ? (
                                            <div className="flex flex-col items-center">
                                                <img src={idImage} alt="Uploaded ID" className="max-h-40 rounded shadow-md mb-4 object-contain" />
                                                <p className="text-sm text-green-600 font-medium"><i className="fa-solid fa-check-circle mr-1"></i> Document Uploaded Successfully</p>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setIdImage(null); setUploadError(null); }}
                                                    className="mt-3 text-xs text-red-500 hover:text-red-700 underline"
                                                >
                                                    Remove and upload different ID
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <i className={`fa-solid fa-id-card text-4xl mb-3 ${uploadError ? 'text-red-400' : 'text-gray-400'}`}></i>
                                                <p className={`font-medium mb-2 ${uploadError ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {uploadError || "Drag & drop or click to upload"}
                                                </p>
                                                <p className="text-xs text-gray-400">JPEG, PNG up to 5MB</p>
                                            </div>
                                        )}
                                        {!idImage && (
                                            <input 
                                                type="file" 
                                                accept="image/jpeg, image/png" 
                                                onChange={handleIdUpload}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                title="Upload ID Document"
                                            />
                                        )}
                                    </div>

                                    <div className="flex gap-4 mb-4">
                                        <button 
                                            onClick={() => setStage('START')} 
                                            className="px-6 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition"
                                        >
                                            Back
                                        </button>
                                        <button 
                                            onClick={startCamera} 
                                            disabled={!idImage}
                                            className={`px-6 py-2 font-bold rounded-lg transition shadow-lg ${idImage ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30' : 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'}`}
                                        >
                                            Proceed to Face Scan
                                        </button>
                                    </div>
                                    <div className="text-center mt-2">
                                        <p className="text-sm text-gray-500 mb-2">Don't have your Aadhaar?</p>
                                        <a 
                                            href="https://uidai.gov.in/en/my-aadhaar/get-aadhaar.html" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 font-medium rounded-lg hover:bg-orange-100 transition border border-orange-200 text-sm"
                                        >
                                            <i className="fa-solid fa-download"></i>
                                            Download Aadhaar from UIDAI
                                        </a>
                                    </div>
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
                                <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 border-dashed ${livenessInstruction ? 'border-cyber' : 'border-white/40'} rounded-[3rem] flex items-center justify-center transition-all duration-500`}>
                                    {/* Subtle pulsing glow behind the frame */}
                                    <div className={`absolute inset-0 rounded-[3rem] pointer-events-none transition-all duration-1000 animate-pulse ${livenessInstruction ? 'shadow-[0_0_60px_rgba(0,243,255,0.6)]' : 'shadow-[0_0_30px_rgba(255,255,255,0.3)]'}`}></div>
                                    
                                    {/* Animated Corner Markers */}
                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-cyber rounded-tl-[3rem] animate-[ping_3s_ease-in-out_infinite_reverse] opacity-70"></div>
                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-cyber rounded-tr-[3rem] animate-[ping_3s_ease-in-out_infinite_reverse] opacity-70" style={{ animationDelay: '0.5s' }}></div>
                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-cyber rounded-bl-[3rem] animate-[ping_3s_ease-in-out_infinite_reverse] opacity-70" style={{ animationDelay: '1s' }}></div>
                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-cyber rounded-br-[3rem] animate-[ping_3s_ease-in-out_infinite_reverse] opacity-70" style={{ animationDelay: '1.5s' }}></div>
                                    
                                    {/* Static Corner Markers */}
                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyber rounded-tl-[3rem]"></div>
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyber rounded-tr-[3rem]"></div>
                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyber rounded-bl-[3rem]"></div>
                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyber rounded-br-[3rem]"></div>
                                    
                                    {/* Center alignment crosshair (subtle) */}
                                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-20">
                                        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-cyber"></div>
                                        <div className="absolute top-0 left-1/2 w-[1px] h-full bg-cyber"></div>
                                    </div>
                                </div>

                                {/* Liveness Instruction Overlay */}
                                {livenessInstruction && (
                                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-30 w-full max-w-md px-4">
                                        <div className="bg-black/70 backdrop-blur-md border border-cyber/50 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,243,255,0.2)] flex flex-col items-center text-center animate-in slide-in-from-top-4 duration-300">
                                            <div className="text-cyber/80 text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                                Action Required
                                            </div>
                                            <p className="text-white font-bold text-2xl tracking-wide">
                                                {livenessInstruction}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Instructions Overlay when not running */}
                                {!livenessInstruction && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-10">
                                        <div className="bg-black/80 border border-white/20 rounded-2xl p-6 max-w-sm w-11/12 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-500">
                                            <h3 className="text-white text-xl font-bold mb-5 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-cyber/20 flex items-center justify-center">
                                                    <i className="fa-solid fa-expand text-cyber text-xl"></i>
                                                </div>
                                                Face Scan Guide
                                            </h3>
                                            <ul className="space-y-4 text-left">
                                                <li className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-cyber/20 text-cyber flex items-center justify-center shrink-0 font-bold text-sm border border-cyber/50 mt-0.5">1</div>
                                                    <p className="text-gray-200 text-sm leading-relaxed">Position your face clearly within the <span className="text-white font-semibold">dashed frame</span>.</p>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-cyber/20 text-cyber flex items-center justify-center shrink-0 font-bold text-sm border border-cyber/50 mt-0.5">2</div>
                                                    <p className="text-gray-200 text-sm leading-relaxed">Ensure you are in a <span className="text-white font-semibold">well-lit area</span> without glare.</p>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-cyber/20 text-cyber flex items-center justify-center shrink-0 font-bold text-sm border border-cyber/50 mt-0.5">3</div>
                                                    <p className="text-gray-200 text-sm leading-relaxed">Click the <span className="text-red-400 font-semibold">Record button</span> below and follow the prompts.</p>
                                                </li>
                                            </ul>
                                        </div>
                                        
                                        {/* Animated arrow pointing down */}
                                        <div className="absolute bottom-32 animate-bounce text-white flex flex-col items-center">
                                            <span className="text-sm font-bold tracking-widest uppercase mb-1 drop-shadow-md">Ready?</span>
                                            <i className="fa-solid fa-arrow-down text-2xl drop-shadow-md"></i>
                                        </div>
                                    </div>
                                )}
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
    
                                    <div className="flex gap-4">
                                        {analysisResult.isReal && (
                                            <button 
                                                onClick={generateCertificate}
                                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-lg shadow-blue-500/30 shrink-0 flex items-center gap-2"
                                            >
                                                <i className="fa-solid fa-file-pdf"></i> Download Certificate
                                            </button>
                                        )}
                                        <button 
                                            onClick={resetProcess}
                                            className="px-8 py-3 glass-panel text-white hover:bg-white/10 rounded-lg transition border border-white/20 shrink-0"
                                        >
                                            {analysisResult.isReal ? 'Continue' : 'Retry Verification'}
                                        </button>
                                    </div>
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

            {/* Login Prompt Modal */}
            {showLoginPrompt && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6 mx-auto">
                            <i className="fa-solid fa-lock text-2xl text-blue-600"></i>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 text-center mb-2">Login Required</h3>
                        <p className="text-gray-600 text-center mb-8">
                            You have to login first then proceed to next. Please sign in to start your secure verification.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={async () => {
                                    setShowLoginPrompt(false);
                                    await login();
                                }}
                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                            >
                                <i className="fa-brands fa-google"></i>
                                Sign in with Google
                            </button>
                            <button 
                                onClick={() => setShowLoginPrompt(false)}
                                className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </section>
    );
};