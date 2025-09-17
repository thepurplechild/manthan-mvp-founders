// lib/workers/pdf-worker.compiled.js
// Compiled worker for production use to ensure deterministic path resolution
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread && parentPort) {
  // Worker thread code
  parentPort.on('message', async (task) => {
    try {
      if (task.type === 'parse') {
        await processPdfParsing(task);
      } else if (task.type === 'ocr') {
        await processPdfOcr(task);
      }
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        data: { 
          taskId: task.taskId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });
}

async function processPdfParsing(task) {
  try {
    // Send initial progress
    parentPort?.postMessage({
      type: 'progress', 
      data: { taskId: task.taskId, progress: 20, step: 'Loading PDF document (compiled worker)' }
    });
    
    // Dynamic import to avoid issues in main thread
    const pdfParse = await import('pdf-parse');
    
    parentPort?.postMessage({
      type: 'progress',
      data: { taskId: task.taskId, progress: 40, step: 'Parsing PDF content (compiled worker)' }
    });
    
    const pdfData = await pdfParse.default(task.buffer);
    
    parentPort?.postMessage({
      type: 'progress',
      data: { taskId: task.taskId, progress: 80, step: `Extracted text from ${pdfData.numpages} pages (compiled worker)` }
    });
    
    parentPort?.postMessage({
      type: 'result',
      data: { taskId: task.taskId, result: pdfData }
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      data: { 
        taskId: task.taskId, 
        error: `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    });
  }
}

async function processPdfOcr(task) {
  try {
    parentPort?.postMessage({
      type: 'progress',
      data: { taskId: task.taskId, progress: 20, step: 'Initializing OCR processing (compiled worker)' }
    });
    
    // Dynamic imports for server-only dependencies
    const { loadPdfjs } = await import('../pdf/loader');
    const { createCanvas } = await import('canvas');
    const Tesseract = await import('tesseract.js');
    
    parentPort?.postMessage({
      type: 'progress',
      data: { taskId: task.taskId, progress: 30, step: 'Loading PDF for OCR (compiled worker)' }
    });
    
    // Initialize PDF.js via loader
    const pdfjsLib = await loadPdfjs();
    const loadingTask = pdfjsLib.getDocument({ 
      data: task.buffer, 
      isEvalSupported: false, 
      useSystemFonts: false 
    });
    const pdf = await loadingTask.promise;
    
    let ocrText = '';
    const totalPages = pdf.numPages || 0;
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const progressPercent = Math.min(40 + Math.floor((pageNum - 1) / Math.max(1, totalPages) * 40), 85);
      
      parentPort?.postMessage({
        type: 'progress',
        data: { 
          taskId: task.taskId, 
          progress: progressPercent, 
          step: `OCR processing page ${pageNum}/${totalPages} (compiled worker)`
        }
      });
      
      const page = await pdf.getPage(pageNum);
      const scale = 2.0; // Higher scale for better OCR accuracy
      const viewport = page.getViewport({ scale });
      
      // Create canvas for rendering
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error(`Failed to create canvas context for page ${pageNum}`);
      }
      
      // Render PDF page to canvas
      const renderContext = {
        canvasContext: ctx,
        viewport,
      };
      
      await page.render(renderContext).promise;
      
      // Generate image buffer
      const imgBuffer = canvas.toBuffer('image/png');
      
      // Perform OCR
      const ocrResult = await Tesseract.recognize(imgBuffer, 'eng');
      const pageText = ocrResult.data.text.trim();
      
      if (pageText) {
        ocrText += pageText + '\n\n';
      }
    }
    
    parentPort?.postMessage({
      type: 'progress',
      data: { taskId: task.taskId, progress: 95, step: 'OCR processing complete (compiled worker)' }
    });
    
    parentPort?.postMessage({
      type: 'result',
      data: { taskId: task.taskId, result: ocrText.trim() }
    });
    
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      data: { 
        taskId: task.taskId, 
        error: `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    });
  }
}