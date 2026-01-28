
import { GoogleGenAI } from "@google/genai";

// --- Internal IA Service (ai.ts logic) ---
class GeminiArtService {
    private static instance: GeminiArtService;
    private readonly modelName = 'gemini-3-pro-image-preview';

    private constructor() {}

    static getInstance() {
        if (!this.instance) this.instance = new GeminiArtService();
        return this.instance;
    }

    private getAIInstance() {
        if (!process.env.API_KEY) {
            throw new Error("No se detectó API Key. Por favor, selecciona una clave de proyecto Cloud.");
        }
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }

    async applyArtStyle(base64Image: string, mimeType: string, style: string) {
        const ai = this.getAIInstance();
        const prompt = `Transform this image into a high-quality ${style} professional artwork. 
                       Preserve subjects but apply the artistic medium strictly. 
                       Resolution: 1K. Professional finish.`;

        try {
            const response = await ai.models.generateContent({
                model: this.modelName,
                contents: {
                    parts: [
                        { inlineData: { mimeType, data: base64Image } },
                        { text: prompt }
                    ]
                },
                config: {
                    imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
                }
            });

            const result = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (!result?.inlineData) throw new Error("La IA no devolvió una imagen válida.");

            return {
                data: result.inlineData.data,
                mimeType: result.inlineData.mimeType,
                url: `data:${result.inlineData.mimeType};base64,${result.inlineData.data}`
            };
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    async refineArtwork(base64Image: string, mimeType: string, instructions: string) {
        const ai = this.getAIInstance();
        try {
            const response = await ai.models.generateContent({
                model: this.modelName,
                contents: {
                    parts: [
                        { inlineData: { mimeType, data: base64Image } },
                        { text: `Modify this image using these instructions: ${instructions}. Keep the style consistent.` }
                    ]
                },
                config: {
                    imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
                }
            });

            const result = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (!result?.inlineData) throw new Error("Error en el refinamiento.");

            return {
                data: result.inlineData.data,
                mimeType: result.inlineData.mimeType,
                url: `data:${result.inlineData.mimeType};base64,${result.inlineData.data}`
            };
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        console.error("Gemini Pro Service Error:", error);
        if (error.message?.includes("entity was not found") || error.message?.includes("API key not found")) {
            window.dispatchEvent(new CustomEvent('gemini-reauth-needed'));
        }
    }
}

// --- App Controller ---

let UI: any = {};
const State = {
    mediaType: 'none' as 'image' | 'video' | 'none',
    capturedFrames: [] as { data: string, mimeType: string, url: string }[],
    stylizedFrames: [] as { data: string, mimeType: string, url: string }[],
    animationInterval: null as any
};

function setupElements() {
    UI = {
        uploadInput: document.getElementById('media-upload') as HTMLInputElement,
        generateBtn: document.getElementById('generate-btn') as HTMLButtonElement,
        imagePreview: document.getElementById('image-preview') as HTMLImageElement,
        videoPreview: document.getElementById('video-preview') as HTMLVideoElement,
        videoControls: document.getElementById('video-controls') as HTMLElement,
        frameSlider: document.getElementById('frame-slider') as HTMLInputElement,
        frameCountDisplay: document.getElementById('frame-count-display') as HTMLElement,
        extractBtn: document.getElementById('extract-frames-btn') as HTMLButtonElement,
        styleSelect: document.getElementById('style-select') as HTMLSelectElement,
        
        outputPlaceholder: document.getElementById('output-placeholder') as HTMLElement,
        previewPlaceholder: document.getElementById('preview-placeholder') as HTMLElement,
        resultWrapper: document.getElementById('result-wrapper') as HTMLElement,
        resultImg: document.getElementById('result-img') as HTMLImageElement,
        resultVideo: document.getElementById('result-video') as HTMLVideoElement,
        
        loader: document.getElementById('loader') as HTMLElement,
        loaderText: document.getElementById('loader-text') as HTMLElement,
        editSection: document.getElementById('edit-section') as HTMLElement,
        editPrompt: document.getElementById('edit-prompt') as HTMLInputElement,
        applyEditBtn: document.getElementById('apply-edit-btn') as HTMLButtonElement,
        downloadBtn: document.getElementById('download-btn') as HTMLButtonElement,
        exportPdfBtn: document.getElementById('export-pdf-btn') as HTMLButtonElement,

        authOverlay: document.getElementById('auth-overlay') as HTMLElement,
        connectBtn: document.getElementById('connect-cloud-btn') as HTMLButtonElement,
        reconnectBtn: document.getElementById('reconnect-btn') as HTMLButtonElement,
        cameraBtn: document.getElementById('camera-btn') as HTMLButtonElement,
        cameraOverlay: document.getElementById('camera-overlay') as HTMLElement,
        cameraFeed: document.getElementById('camera-feed') as HTMLVideoElement,
        takePhotoBtn: document.getElementById('take-photo-btn') as HTMLButtonElement,
        closeCameraBtn: document.getElementById('close-camera-btn') as HTMLButtonElement,
    };
}

async function init() {
    setupElements();
    await checkAuthStatus();

    window.addEventListener('gemini-reauth-needed', () => {
        UI.authOverlay?.classList.remove('hidden');
    });

    if (UI.connectBtn) {
        UI.connectBtn.onclick = async () => {
            if ((window as any).aistudio) {
                await (window as any).aistudio.openSelectKey();
                UI.authOverlay?.classList.add('hidden');
            }
        };
    }

    if (UI.reconnectBtn) {
        UI.reconnectBtn.onclick = async () => {
            if ((window as any).aistudio) await (window as any).aistudio.openSelectKey();
        };
    }

    if (UI.uploadInput) UI.uploadInput.onchange = handleMediaUpload;
    if (UI.cameraBtn) UI.cameraBtn.onclick = startCamera;
    if (UI.closeCameraBtn) UI.closeCameraBtn.onclick = stopCamera;
    if (UI.takePhotoBtn) UI.takePhotoBtn.onclick = takePhoto;
    if (UI.extractBtn) UI.extractBtn.onclick = extractFrames;
    if (UI.generateBtn) UI.generateBtn.onclick = runArtGeneration;
    if (UI.applyEditBtn) UI.applyEditBtn.onclick = runRefinement;
    if (UI.downloadBtn) UI.downloadBtn.onclick = downloadResult;
    if (UI.exportPdfBtn) UI.exportPdfBtn.onclick = exportPDF;
    if (UI.frameSlider) {
        UI.frameSlider.oninput = (e: any) => {
            if (UI.frameCountDisplay) UI.frameCountDisplay.innerText = e.target.value;
        };
    }
}

async function checkAuthStatus() {
    if (!(window as any).aistudio) return;
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
        UI.authOverlay?.classList.remove('hidden');
    }
}

// --- Handler Functions ---

async function handleMediaUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    resetAppState();

    if (file.type.startsWith('image/')) {
        State.mediaType = 'image';
        const base64 = await toBase64(file);
        State.capturedFrames = [{ data: base64, mimeType: file.type, url: `data:${file.type};base64,${base64}` }];
        updatePreview(State.capturedFrames[0].url, 'image');
    } else if (file.type.startsWith('video/')) {
        State.mediaType = 'video';
        if (UI.videoPreview) UI.videoPreview.src = URL.createObjectURL(file);
        updatePreview('', 'video');
        UI.videoControls?.classList.remove('hidden');
    }
}

function updatePreview(url: string, type: 'image' | 'video') {
    UI.previewPlaceholder?.classList.add('hidden');
    if (type === 'image') {
        if (UI.imagePreview) {
            UI.imagePreview.src = url;
            UI.imagePreview.classList.remove('hidden');
        }
        UI.videoPreview?.classList.add('hidden');
        if (UI.generateBtn) UI.generateBtn.disabled = false;
    } else {
        UI.imagePreview?.classList.add('hidden');
        UI.videoPreview?.classList.remove('hidden');
    }
}

async function extractFrames() {
    const video = UI.videoPreview;
    if (!video || !video.duration) return;

    setLoading(true, "Extrayendo secuencia...");
    const count = parseInt(UI.frameSlider?.value || "10");
    const interval = video.duration / count;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    State.capturedFrames = [];
    for (let i = 0; i < count; i++) {
        video.currentTime = i * interval;
        await new Promise<void>(r => video.onseeked = () => r());
        ctx!.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        State.capturedFrames.push({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', url: dataUrl });
    }

    setLoading(false);
    UI.videoControls?.classList.add('hidden');
    if (UI.generateBtn) UI.generateBtn.disabled = false;
    startFrameAnimation();
}

function startFrameAnimation() {
    clearInterval(State.animationInterval);
    if (State.capturedFrames.length < 2) return;
    let i = 0;
    State.animationInterval = setInterval(() => {
        if (UI.imagePreview) UI.imagePreview.src = State.capturedFrames[i].url;
        i = (i + 1) % State.capturedFrames.length;
    }, 200);
    UI.imagePreview?.classList.remove('hidden');
    UI.videoPreview?.classList.add('hidden');
}

async function runArtGeneration() {
    const service = GeminiArtService.getInstance();
    setLoading(true, "Gemini 3 Pro está creando...");
    State.stylizedFrames = [];

    try {
        for (let i = 0; i < State.capturedFrames.length; i++) {
            if (State.capturedFrames.length > 1 && UI.loaderText) {
                UI.loaderText.innerText = `Pintando fotograma ${i+1}/${State.capturedFrames.length}...`;
            }
            const frame = State.capturedFrames[i];
            const result = await service.applyArtStyle(frame.data, frame.mimeType, UI.styleSelect?.value || 'Watercolor Painting');
            State.stylizedFrames.push(result);
        }
        displayResult();
    } catch (err: any) {
        alert("Error de Generación: " + err.message);
    } finally {
        setLoading(false);
    }
}

async function runRefinement() {
    const prompt = UI.editPrompt?.value.trim();
    if (!prompt || !State.stylizedFrames.length) return;

    setLoading(true, "Refinando obra...");
    try {
        const last = State.stylizedFrames[0];
        const result = await GeminiArtService.getInstance().refineArtwork(last.data, last.mimeType, prompt);
        State.stylizedFrames[0] = result;
        State.mediaType = 'image';
        displayResult();
    } catch (err: any) {
        alert("Error al refinar: " + err.message);
    } finally {
        setLoading(false);
    }
}

function displayResult() {
    UI.outputPlaceholder?.classList.add('hidden');
    UI.resultWrapper?.classList.remove('hidden');
    UI.editSection?.classList.remove('hidden');
    UI.downloadBtn?.classList.remove('hidden');
    UI.exportPdfBtn?.classList.remove('hidden');

    if (State.stylizedFrames.length === 1) {
        if (UI.resultImg) {
            UI.resultImg.src = State.stylizedFrames[0].url;
            UI.resultImg.classList.remove('hidden');
        }
        UI.resultVideo?.classList.add('hidden');
    } else {
        generateAnimatedResult();
    }
}

async function generateAnimatedResult() {
    if (UI.loaderText) UI.loaderText.innerText = "Compilando animación...";
    UI.loader?.classList.remove('hidden');
    
    const canvas = document.createElement('canvas');
    const img = new Image();
    await new Promise<void>(r => { 
        img.onload = () => r(); 
        img.src = State.stylizedFrames[0].url; 
    });
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    const stream = (canvas as any).captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: any[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
        if (UI.resultVideo) {
            UI.resultVideo.src = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
            UI.resultVideo.classList.remove('hidden');
        }
        UI.resultImg?.classList.add('hidden');
        UI.loader?.classList.add('hidden');
    };
    
    recorder.start();
    for (const f of State.stylizedFrames) {
        await new Promise<void>(r => {
            img.onload = () => { ctx!.drawImage(img, 0, 0); r(); };
            img.src = f.url;
        });
        await new Promise<void>(r => setTimeout(() => r(), 100));
    }
    recorder.stop();
}

// --- Utils ---

async function exportPDF() {
    if (!State.stylizedFrames.length) return;
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();
    const margin = 15;
    const drawWidth = width - (margin * 2);

    for (let i = 0; i < State.stylizedFrames.length; i++) {
        if (i > 0) doc.addPage();
        const f = State.stylizedFrames[i];
        const img = new Image();
        await new Promise<void>(r => { img.onload = () => r(); img.src = f.url; });
        const drawHeight = drawWidth * (img.height / img.width);
        doc.addImage(f.url, 'PNG', margin, margin, drawWidth, drawHeight);
        doc.setFontSize(8);
        doc.text(`Gemini 3 Pro Art - Pág ${i + 1}`, margin, drawHeight + margin + 10);
    }
    doc.save(`art-studio-export-${Date.now()}.pdf`);
}

function downloadResult() {
    const link = document.createElement('a');
    if (State.stylizedFrames.length === 1) {
        link.href = State.stylizedFrames[0].url;
        link.download = `art-${Date.now()}.png`;
    } else if (UI.resultVideo && UI.resultVideo.src) {
        link.href = UI.resultVideo.src;
        link.download = `art-animation-${Date.now()}.webm`;
    }
    link.click();
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (UI.cameraFeed) UI.cameraFeed.srcObject = stream;
        UI.cameraOverlay?.classList.remove('hidden');
    } catch { alert("No se pudo acceder a la cámara."); }
}

function stopCamera() {
    const stream = UI.cameraFeed?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    UI.cameraOverlay?.classList.add('hidden');
}

function takePhoto() {
    const video = UI.cameraFeed;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    State.mediaType = 'image';
    resetAppState();
    State.capturedFrames = [{ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', url: dataUrl }];
    updatePreview(dataUrl, 'image');
    stopCamera();
}

function resetAppState() {
    State.capturedFrames = [];
    State.stylizedFrames = [];
    clearInterval(State.animationInterval);
    UI.videoControls?.classList.add('hidden');
    UI.resultWrapper?.classList.add('hidden');
    UI.editSection?.classList.add('hidden');
    UI.downloadBtn?.classList.add('hidden');
    UI.exportPdfBtn?.classList.add('hidden');
    UI.outputPlaceholder?.classList.remove('hidden');
    if (UI.resultVideo) UI.resultVideo.src = "";
    if (UI.videoPreview) UI.videoPreview.src = "";
}

function setLoading(active: boolean, text: string = "") {
    UI.loader?.classList.toggle('hidden', !active);
    if (UI.loaderText) UI.loaderText.innerText = text;
    if (UI.generateBtn) UI.generateBtn.disabled = active;
}

function toBase64(file: File): Promise<string> {
    return new Promise((r, j) => {
        const reader = new FileReader();
        reader.onload = () => r((reader.result as string).split(',')[1]);
        reader.onerror = j;
        reader.readAsDataURL(file);
    });
}

// Bootstrap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
