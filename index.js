# Reemplazar todo el archivo index.js
@"
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Configuration & Constants ---
const MODEL_STYLIZER = 'gemini-2.5-flash';
const MODEL_EDITOR = 'gemini-2.5-flash';

// --- State Management ---
const state = {
    mediaType: 'none',
    capturedFrames: [], 
    stylizedFrames: [], 
    previewInterval: null,
    isProcessing: false
};

// ... (resto del código igual hasta la función generateStyle)

// --- Gemini Generation ---
async function generateStyle() {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
        alert('No API key configured');
        return;
    }
    
    if (!state.capturedFrames.length) return;

    setLoading(true, "Creating artwork with Gemini...");
    state.stylizedFrames = [];
    
    const style = elements.styleSelect?.value || 'Watercolor Painting';
    const prompt = \`Transform this image into a \${style} style. Preserve the main subject with high detail and professional artistic quality.\`;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_STYLIZER });
        
        for (let i = 0; i < state.capturedFrames.length; i++) {
            if (state.capturedFrames.length > 1 && elements.loaderText) {
                elements.loaderText.textContent = \`Styling frame \${i+1}/\${state.capturedFrames.length}...\`;
            }

            const frame = state.capturedFrames[i];
            
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: frame.data,
                        mimeType: frame.mimeType
                    }
                }
            ]);

            const response = await result.response;
            const text = response.text();
            
            // Gemini solo devuelve texto, NO genera imágenes directamente
            // Necesitas usar un modelo de generación de imágenes
            console.log('Gemini response:', text);
            
            // Por ahora, mostrar el original como resultado
            state.stylizedFrames.push(frame);
        }
        
        presentResult();
    } catch (err) {
        console.error('ERROR DE GEMINI:', err);
        handleError(err);
    } finally {
        setLoading(false);
    }
}

async function handleEditImage() {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) return;
    
    const promptText = elements.editPrompt?.value.trim();
    if (!promptText || !state.stylizedFrames.length) return;

    setLoading(true, "Refining...");
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_EDITOR });
        
        const currentFrame = state.