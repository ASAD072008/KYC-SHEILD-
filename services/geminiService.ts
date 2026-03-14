import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

// Initialize Gemini Client
// Note: In a real deployment, the API key should be handled securely. 
// For this demo environment, we assume process.env.API_KEY is available.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// System instruction to guide Gemini's persona
const SYSTEM_INSTRUCTION = `
You are a KYC (Know Your Customer) Security Assistant for "KYC Shield", a high-tech deepfake detection platform used by banks. 
Your tone should be professional, slightly technical but accessible, and reassuring.
You are "Online" and ready to assist security officers.

Your capabilities in this simulated environment:
1. Explaining how deepfakes are detected (e.g., lack of blood flow, irregular blinking, texture artifacts).
2. Guiding the user on how to use the dashboard (activating camera, interpreting graphs).
3. Analyzing specific "simulated" error codes if the user asks (e.g., "Error 404: Face Not Found").

If the user asks about the technical stack, mention Google Gemini and MediaPipe.
Keep responses concise, under 100 words unless asked for detailed explanations.
`;

let chatSession: Chat | null = null;

export const initializeChat = () => {
  try {
    chatSession = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    return true;
  } catch (error) {
    console.error("Failed to initialize Gemini chat:", error);
    return false;
  }
};

export const sendMessageToGemini = async (message: string): Promise<string> => {
  if (!chatSession) {
    const initialized = initializeChat();
    if (!initialized || !chatSession) {
      return "Error: AI Service not initialized. Please check your API Key.";
    }
  }

  try {
    const response: GenerateContentResponse = await chatSession.sendMessage({ message });
    return response.text || "I processed that, but have no text response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Connection error: Unable to reach Gemini servers. Please try again.";
  }
};

export interface AIAnalysisResult {
    isReal: boolean;
    confidence: number;
    issues: string[];
    message: string;
    idMatch?: boolean; // Added for ID verification
    extractedName?: string; // Extracted from ID
    extractedIdNumber?: string; // Extracted from ID
}

// Helper function to retry API calls with exponential backoff
const fetchWithRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 3): Promise<T> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await apiCall();
        } catch (error: any) {
            const isRateLimit = error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota");
            
            if (isRateLimit && attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1500 + Math.random() * 1000; // Exponential backoff with jitter
                console.warn(`Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1} of ${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error; // Re-throw if not a rate limit or out of retries
        }
    }
    throw new Error("Max retries reached");
};

export const analyzeIdentity = async (idImageBase64: string, liveImageBase64: string): Promise<AIAnalysisResult> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
        
        if (!apiKey) {
            console.error("API Key is missing");
            return {
                isReal: false,
                confidence: 0,
                issues: ["Configuration Error"],
                message: "Missing API Key",
                idMatch: false
            };
        }

        const ai = new GoogleGenAI({ apiKey });

        const idBase64Data = idImageBase64.split(',')[1];
        const liveBase64Data = liveImageBase64.split(',')[1];

        const response = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Use flash for faster response and higher rate limits
            contents: {
                parts: [
                    { 
                        inlineData: { mimeType: 'image/jpeg', data: idBase64Data } 
                    },
                    { 
                        inlineData: { mimeType: 'image/jpeg', data: liveBase64Data } 
                    },
                    { 
                        text: `You are an expert KYC forensic AI. I am providing two images:
                        Image 1: An uploaded government ID document (e.g., Aadhar card, Passport).
                        Image 2: A live selfie of the user.
                        
                        Perform the following checks:
                        1. Document Authenticity: Does Image 1 look like a valid, untampered government ID? Are there signs of digital manipulation or is it a picture of a screen?
                        2. Face Matching: Extract the face from the ID document (Image 1) and compare it to the live selfie (Image 2). You MUST act as a highly skeptical security auditor. Assume the two faces are DIFFERENT people unless proven otherwise. Compare the facial features: nose shape, eye distance, jawline, ear shape, and eyebrows. If there is ANY difference in these core biometric features, you MUST reject the match. We require a strict match (at least 95% similarity) to pass.
                        3. Liveness: Does the live selfie (Image 2) look like a real person and not a photo/screen?
                        4. Data Extraction: Extract the Full Name and the ID Number (e.g., Aadhar number, Passport number) from the ID document (Image 1).

                        Return a JSON object strictly adhering to this schema:
                        {
                            "isReal": boolean (true ONLY if the live face is real AND the ID is authentic AND the face matches at least 95%),
                            "idMatch": boolean (true if there is at least an 95% structural match between the ID face and the live selfie),
                            "confidence": number (0-100 integer representing overall confidence in the identity),
                            "issues": string[] (list of suspicious features found in either image, or ["None"] if clean),
                            "message": string (short user-facing explanation, max 10 words),
                            "extractedName": string (The full name found on the ID, or "Unknown" if not found),
                            "extractedIdNumber": string (The ID number found on the ID, or "Unknown" if not found)
                        }
                        
                        Be extremely strict on Document Authenticity (must be a real ID), Liveness (must be a real human), and Face Matching. If there is any doubt that they are the same person, set idMatch to false. CRITICAL: If the face match is less than 95%, you MUST set both idMatch and isReal to false, and add "Face mismatch" to the issues list.` 
                    }
                ]
            },
            config: {
                responseMimeType: 'application/json'
            }
        }));

        let text = "";
        try {
            text = response.text;
            if (!text) throw new Error("Empty response from AI");
        } catch (e) {
            console.warn("AI response blocked or empty. Likely a face mismatch triggering safety filters.", e);
            return {
                isReal: false,
                idMatch: false,
                confidence: 0,
                issues: ["Face mismatch or unclear image detected"],
                message: "Verification Failed"
            };
        }
        
        let parsedResult: any;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanText = jsonMatch ? jsonMatch[0] : text.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedResult = JSON.parse(cleanText);
        } catch (e) {
            console.error("Failed to parse AI response:", text);
            return {
                isReal: false,
                idMatch: false,
                confidence: 0,
                issues: ["Face mismatch or invalid document format"],
                message: "Verification Failed"
            };
        }

        const isReal = parsedResult.isReal === true || parsedResult.isReal === "true";
        const idMatch = parsedResult.idMatch === true || parsedResult.idMatch === "true";
        const confidence = Number(parsedResult.confidence) || 0;

        let issuesArray = ["None"];
        if (Array.isArray(parsedResult.issues) && parsedResult.issues.length > 0) {
            issuesArray = parsedResult.issues;
        } else if (typeof parsedResult.issues === 'string' && parsedResult.issues.trim() !== "") {
            issuesArray = [parsedResult.issues];
        }

        let finalIsReal = isReal;
        let finalMessage = parsedResult.message || (isReal ? "Identity Verified" : "Verification Failed");

        // Enforce strict matching logic: if idMatch is false, it MUST NOT be approved
        if (!idMatch) {
            finalIsReal = false;
            finalMessage = "Face mismatch detected";
            if (!issuesArray.includes("Face mismatch")) {
                if (issuesArray[0] === "None") issuesArray = [];
                issuesArray.push("Face mismatch");
            }
        }

        // If it's not real but issues are "None", provide a default reason
        if (!finalIsReal && issuesArray.length === 1 && issuesArray[0] === "None") {
            issuesArray = ["Failed authenticity or liveness check"];
        }

        return {
            isReal: finalIsReal,
            idMatch,
            confidence,
            issues: issuesArray,
            message: finalMessage,
            extractedName: parsedResult.extractedName !== undefined ? String(parsedResult.extractedName) : undefined,
            extractedIdNumber: parsedResult.extractedIdNumber !== undefined ? String(parsedResult.extractedIdNumber) : undefined
        };

    } catch (error: any) {
        console.error("Identity Analysis Error:", error);
        
        let errorMessage = "AI Verification Failed";
        let issues = ["System Error", "Connection Failed"];
        
        if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
            errorMessage = "Server Busy";
            issues = ["Rate limit exceeded. Please try again in a few minutes."];
        }

        return {
            isReal: false,
            idMatch: false,
            confidence: 0,
            issues: issues,
            message: errorMessage
        };
    }
};

export const analyzeFaceFrame = async (base64Image: string): Promise<AIAnalysisResult> => {
    try {
        // Use the standard GEMINI_API_KEY for free tier models
        // Check for both standard and VITE_ prefixed keys
        const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
        
        if (!apiKey) {
            console.error("API Key is missing");
            return {
                isReal: false,
                confidence: 0,
                issues: ["Configuration Error"],
                message: "Missing API Key"
            };
        }

        const ai = new GoogleGenAI({ apiKey });

        // Remove the data URL prefix to get just the base64 string
        const base64Data = base64Image.split(',')[1];

        const response = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { 
                        inlineData: { 
                            mimeType: 'image/jpeg', 
                            data: base64Data 
                        } 
                    },
                    { 
                        text: `You are a biometric security AI. Analyze this image from a KYC video stream for liveness and deepfake detection.
                        
                        Check for:
                        1. Screen Moire patterns (indicating a photo of a screen).
                        2. 2D Flatness or paper texture (holding up a printed photo).
                        3. Deepfake artifacts (blurring around edges, unnatural eye reflections, warping).
                        4. Natural lighting and micro-expressions (indicative of a real human).

                        Return a JSON object strictly adhering to this schema:
                        {
                            "isReal": boolean,
                            "confidence": number (0-100 integer),
                            "issues": string[] (list of suspicious features found, or ["None"] if clean),
                            "message": string (short user-facing explanation, max 10 words)
                        }
                        
                        Be strict. If the image is low quality, blurry, or clearly a digital reproduction, mark isReal as false.` 
                    }
                ]
            },
            config: {
                responseMimeType: 'application/json'
            }
        }));

        let text = "";
        try {
            text = response.text;
            if (!text) throw new Error("Empty response from AI");
        } catch (e) {
            console.warn("AI response blocked or empty. Likely triggering safety filters.", e);
            return {
                isReal: false,
                confidence: 0,
                issues: ["Unclear image or liveness check failed"],
                message: "Verification Failed"
            };
        }
        
        let parsedResult: any;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanText = jsonMatch ? jsonMatch[0] : text.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedResult = JSON.parse(cleanText);
        } catch (e) {
            console.error("Failed to parse AI response:", text);
            return {
                isReal: false,
                confidence: 0,
                issues: ["Unclear image or invalid response format"],
                message: "Verification Failed"
            };
        }

        const isReal = parsedResult.isReal === true || parsedResult.isReal === "true";
        const confidence = Number(parsedResult.confidence) || 0;

        let issuesArray = ["None"];
        if (Array.isArray(parsedResult.issues) && parsedResult.issues.length > 0) {
            issuesArray = parsedResult.issues;
        } else if (typeof parsedResult.issues === 'string' && parsedResult.issues.trim() !== "") {
            issuesArray = [parsedResult.issues];
        }

        // If it's not real but issues are "None", provide a default reason
        if (!isReal && issuesArray.length === 1 && issuesArray[0] === "None") {
            issuesArray = ["Failed liveness check"];
        }

        const message = parsedResult.message || (isReal ? "Liveness Verified" : "Verification Failed");

        // Validate and normalize the result
        return {
            isReal,
            confidence,
            issues: issuesArray,
            message
        };

    } catch (error: any) {
        console.error("Face Analysis Error:", error);
        
        let errorMessage = "AI Verification Failed";
        let issues = ["System Error", "Connection Failed"];
        
        if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
            errorMessage = "Server Busy";
            issues = ["Rate limit exceeded. Please try again in a few minutes."];
        }

        return {
            isReal: false,
            confidence: 0,
            issues: issues,
            message: errorMessage
        };
    }
};