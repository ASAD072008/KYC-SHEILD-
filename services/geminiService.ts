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
}

export const analyzeFaceFrame = async (base64Image: string): Promise<AIAnalysisResult> => {
    try {
        // Use the standard GEMINI_API_KEY for free tier models
        const apiKey = process.env.GEMINI_API_KEY || '';
        const ai = new GoogleGenAI({ apiKey });

        // Remove the data URL prefix to get just the base64 string
        const base64Data = base64Image.split(',')[1];

        const response = await ai.models.generateContent({
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
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");
        
        let parsedResult: any;
        try {
            parsedResult = JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse AI response:", text);
            throw new Error("Invalid JSON response from AI");
        }

        // Validate and normalize the result
        return {
            isReal: typeof parsedResult.isReal === 'boolean' ? parsedResult.isReal : false,
            confidence: typeof parsedResult.confidence === 'number' ? parsedResult.confidence : 0,
            issues: Array.isArray(parsedResult.issues) ? parsedResult.issues : ["Analysis Error"],
            message: typeof parsedResult.message === 'string' ? parsedResult.message : "Verification Inconclusive"
        };

    } catch (error) {
        console.error("Face Analysis Error:", error);
        return {
            isReal: false,
            confidence: 0,
            issues: ["System Error", "Connection Failed"],
            message: "AI Verification Failed"
        };
    }
};