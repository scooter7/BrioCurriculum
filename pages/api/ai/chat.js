// File: pages/api/ai/chat.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Retrieve the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Initialize the GoogleGenerativeAI client
// It's important to handle the case where the API key might be missing
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("GEMINI_API_KEY is not set in .env.local. The AI chat functionality will not work.");
  // genAI will remain undefined, and we'll check for it in the handler
}

// Configuration for the generative model
const generationConfig = {
  temperature: 0.7,       // Controls randomness: lower values are more deterministic.
  topK: 1,                // For Gemini 1.5, topK should be set to 1 if used with temperature.
  topP: 0.95,             // Top-p (nucleus) sampling.
  maxOutputTokens: 2048,  // Maximum number of tokens (words/sub-words) in the response.
};

// Safety settings to filter out harmful content
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// API route handler
export default async function handler(req, res) {
  // Check if the AI service is configured (i.e., if API key was found and genAI initialized)
  if (!genAI) {
    console.error("AI Service (genAI) is not initialized, likely due to a missing or invalid API key.");
    return res.status(500).json({ error: "AI Service is not configured. Please check server logs and API key." });
  }

  // Only allow POST requests to this endpoint
  if (req.method === 'POST') {
    try {
      // Destructure expected properties from the request body
      const { message: currentUserMessage, history: clientHistoryBeforeCurrentMessage = [], curriculumContext = "" } = req.body;

      // Validate that a message was provided
      if (!currentUserMessage || typeof currentUserMessage !== 'string' || currentUserMessage.trim() === "") {
        return res.status(400).json({ error: "Message is required and must be a non-empty string." });
      }

      // Define the system instruction
      let systemInstructionText = `You are a helpful AI assistant specializing in curriculum analysis and educational strategy for K-12 and higher education. Provide insightful, actionable advice, and maintain a professional and supportive tone. Be concise but thorough in your explanations.`;
      if (curriculumContext && typeof curriculumContext === 'string' && curriculumContext.trim() !== "") {
        systemInstructionText += ` The user is currently focusing on a curriculum with the following context: "${curriculumContext.trim()}". Please tailor your responses considering this specific curriculum.`;
      }

      // Select the generative model with system instruction if available for the model type
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest", // Updated model name
        generationConfig,
        safetySettings,
        // System instruction is a good way to set context for Gemini 1.5 models
        systemInstruction: {
          role: "system", // Or "user" if model expects system prompt as first user turn
          parts: [{ text: systemInstructionText }],
        },
      });

      // Prepare the history for the SDK's startChat method.
      // It must be an array of alternating user and model roles.
      let effectiveHistoryForSDK = [];
      if (clientHistoryBeforeCurrentMessage.length > 0) {
        // Filter out any potential system messages from client history if systemInstruction is handled above
        const filteredClientHistory = clientHistoryBeforeCurrentMessage.filter(msg => msg.role === 'user' || msg.role === 'model');

        if (filteredClientHistory.length > 0) {
            if (filteredClientHistory[0].role === 'model') {
                // If history starts with 'model' (e.g., our initial greeting),
                // and there's more than just that greeting.
                if (filteredClientHistory.length > 1) {
                    effectiveHistoryForSDK = filteredClientHistory.slice(1); // Start from the first user message
                } else {
                    // Only the initial greeting, so SDK history should be empty
                    effectiveHistoryForSDK = [];
                }
            } else {
                // Starts with 'user' or is already a valid alternating sequence
                effectiveHistoryForSDK = filteredClientHistory;
            }
        }
      }
      
      // Start a chat session with the model, providing the adjusted history
      const chat = model.startChat({
        history: effectiveHistoryForSDK,
      });
      
      // Send the current user's message to the chat session
      // The curriculumContext is now part of the systemInstruction for Gemini 1.5 models
      const result = await chat.sendMessage(currentUserMessage);
      const aiResponse = result.response;
      
      const aiText = aiResponse.text();

      // Send the AI's reply back to the frontend
      res.status(200).json({ reply: aiText });

    } catch (error) {
      console.error("Error calling Gemini API or processing chat:", error.message, error.stack);

      if (error.message && error.message.toLowerCase().includes("api key not valid")) {
         res.status(401).json({ error: "AI API key is invalid or not authorized." });
      } else if (error.message && error.message.toLowerCase().includes("quota")) {
         res.status(429).json({ error: "AI API quota exceeded. Please try again later." });
      } else if (error.message && (error.message.includes("must be 'user'") || error.message.includes("role 'model' should alternate with role 'user'"))) {
        res.status(400).json({ error: "AI chat history format error. Details: " + error.message });
      } else if (error.message && (error.message.includes("is not found for API version") || error.message.includes("is not supported for generateContent") || error.message.includes("models/gemini-1.5-flash-latest is not found"))) {
        res.status(404).json({ error: "AI Model not found or not supported. Please check model name or API key permissions. Details: " + error.message });
      } else {
         res.status(500).json({ error: "Failed to get response from AI. Details: " + (error.message || "Unknown server error") });
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
