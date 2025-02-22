// 1. Magnified Preview Window
function createPreviewWindow() {
    const preview = document.createElement('canvas');
    preview.id = 'previewCanvas';
    preview.width = 200;
    preview.height = 200;
    preview.style.position = 'fixed';
    preview.style.right = '10px';
    preview.style.top = '10px';
    preview.style.border = '1px solid #ccc';
    preview.style.borderRadius = '4px';
    document.body.appendChild(preview);
    
    return preview.getContext('2d');
}

// 2. Enhanced Brush Size Controls
function adjustBrushSize(size) {
    ctx.lineWidth = size;
    updateCursor(size);
    
    // Update size display
    document.getElementById('brushSize').textContent = `Size: ${size}px`;
}

// 3. Precision Mode
let isPrecisionMode = false;
function togglePrecisionMode() {
    isPrecisionMode = !isPrecisionMode;
    if (isPrecisionMode) {
        ctx.lineWidth /= 2;
        canvas.style.cursor = 'crosshair';
        // Add visual indicator for precision mode
        document.getElementById('precisionMode').classList.add('active');
    } else {
        ctx.lineWidth *= 2;
        updateCursor(ctx.lineWidth);
        document.getElementById('precisionMode').classList.remove('active');
    }
}

// Update cursor to show brush size
function updateCursor(size) {
    const cursorCanvas = document.createElement('canvas');
    cursorCanvas.width = size * 2;
    cursorCanvas.height = size * 2;
    const cursorCtx = cursorCanvas.getContext('2d');
    
    // Draw circular cursor
    cursorCtx.beginPath();
    cursorCtx.arc(size, size, size/2, 0, Math.PI * 2);
    cursorCtx.strokeStyle = '#000';
    cursorCtx.stroke();
    
    // Set custom cursor
    canvas.style.cursor = `url(${cursorCanvas.toDataURL()}) ${size} ${size}, crosshair`;
}

// Update preview window while drawing
function updatePreview(e) {
    const previewCtx = document.getElementById('previewCanvas').getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Clear and draw magnified view
    previewCtx.clearRect(0, 0, 200, 200);
    previewCtx.drawImage(
        canvas, 
        x - 50, y - 50, 100, 100,  // Source rectangle
        0, 0, 200, 200             // Destination rectangle
    );
}

// Event listeners
canvas.addEventListener('mousemove', updatePreview);
document.getElementById('precisionMode').addEventListener('click', togglePrecisionMode);
document.getElementById('brushSize').addEventListener('input', (e) => adjustBrushSize(e.target.value));

// Initialize
const previewCtx = createPreviewWindow();
updateCursor(ctx.lineWidth); 