# KYC Shield

* **Project Name:** KYC Shield
* **Team Name:** Tech Titans
* **Team ID:** uyfDqdNFY3qFoOtevOYR
* **Live Demo Link:** [https://kyc-sheild-e7fl.vercel.app?_vercel_share=2GNlKiF8BPclm1ij6fptPjo7fOOlI7jf](https://kyc-sheild-e7fl.vercel.app?_vercel_share=2GNlKiF8BPclm1ij6fptPjo7fOOlI7jf)

## Project Description

**KYC Shield** is an advanced, AI-powered identity verification platform designed to detect deepfakes and prevent identity fraud during the Know Your Customer (KYC) process. 

By leveraging the Google Gemini Vision API, the platform analyzes live facial captures against uploaded official documents (like an Aadhaar card) to ensure the user is a real, live human and not a static image, mask, or AI-generated deepfake. 

**Key Features:**
* **Document Verification:** Secure upload of official ID documents (e.g., Aadhaar) with direct links to download them if needed.
* **Biometric Liveness Detection:** Real-time camera capture with interactive prompts (blinking, turning head, smiling) to verify physical presence.
* **Deepfake Analysis:** Advanced AI analysis to detect synthetic media artifacts, texture inconsistencies, and spoofing attempts.
* **Identity Matching:** Compares the live face capture with the uploaded ID document to confirm a match.
* **Secure Certification:** Generates a downloadable, tamper-proof KYC certificate (PDF) upon successful verification.
* **Interactive AI Assistant:** A built-in chatbot helps guide users through the process and explains any verification failures.

## Technologies Used
* **Frontend:** React, TypeScript, Tailwind CSS, Vite
* **Backend & Database:** Firebase (Firestore, Authentication)
* **AI & Machine Learning:** Google Gemini API (gemini-3-flash-preview) for Deepfake Detection, Liveness Check, and AI Chat Assistant
* **PDF Generation:** jsPDF for secure KYC certificate generation
* **Deployment:** Vercel

## Setup Instructions

Follow these steps to run the code locally:

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Ensure your Firebase configuration is correctly set up in `firebase-applet-config.json` or your Firebase initialization file).*

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000` (or the port specified in your terminal) to view the application.
