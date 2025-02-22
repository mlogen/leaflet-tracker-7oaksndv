class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.isPanning = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.transform = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };
        this.lastMousePos = { x: 0, y: 0 };
        this.backgroundImage = null;
        // Create overlay canvas for cursor preview
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.baseScale = 1;
        this.brushSize = 10;
        this.eraserSize = 20;
        this.lastDrawPoint = null;
        this.drawBuffer = [];
        this.drawInterval = null;
        // Create drawing layer
        this.drawingLayer = document.createElement('canvas');
        this.drawingCtx = this.drawingLayer.getContext('2d', {
            alpha: true,
            willReadFrequently: true
        });

        // Initialize Firebase
        const app = firebase.initializeApp(firebaseConfig);
        this.db = firebase.database();

        // Create a unique identifier for each page
        const getPageId = () => {
            const path = window.location.pathname;
            
            // Map of paths to clean identifiers
            const pathMap = {
                '/': 'swanley',
                '/index.html': 'swanley',
                '/pages/sevenoaks-north.html': 'sevenoaks-north',
                '/pages/sevenoaks-rural-ne.html': 'sevenoaks-rural-ne',
                '/pages/sevenoaks-town.html': 'sevenoaks-town',
                '/pages/sevenoaks-west.html': 'sevenoaks-west',
                '/pages/sevenoaks-rural-s.html': 'sevenoaks-rural-s'
            };
            
            // Return mapped id or a fallback
            return pathMap[path] || 'default';
        };
        
        const pageId = getPageId();
        this.mapRef = this.db.ref('maps/' + pageId);

        // Listen for real-time updates
        this.mapRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && (!this.lastSync || data.timestamp > this.lastSync)) {
                this.loadFromFirebase(data);
                this.lastSync = data.timestamp;
            }
        });

        // Create cursor canvas for tool feedback
        this.cursorCanvas = document.createElement('canvas');
        this.cursorCanvas.style.position = 'absolute';
        this.cursorCanvas.style.pointerEvents = 'none';
        this.cursorCtx = this.cursorCanvas.getContext('2d');
        
        // Performance optimizations
        this.requestAnimationId = null;
        this.needsRedraw = false;

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Set canvas sizes
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.overlayCanvas.width = this.canvas.width;
        this.overlayCanvas.height = this.canvas.height;
        this.drawingLayer.width = this.canvas.width;
        this.drawingLayer.height = this.canvas.height;
        
        // Add overlay canvas to DOM
        this.canvas.parentNode.appendChild(this.overlayCanvas);
        this.overlayCanvas.style.left = this.canvas.offsetLeft + 'px';
        this.overlayCanvas.style.top = this.canvas.offsetTop + 'px';

        // Add cursor canvas to DOM
        this.canvas.parentNode.appendChild(this.cursorCanvas);
        this.cursorCanvas.width = this.canvas.width;
        this.cursorCanvas.height = this.canvas.height;
        this.cursorCanvas.style.left = this.canvas.offsetLeft + 'px';
        this.cursorCanvas.style.top = this.canvas.offsetTop + 'px';

        // Set default styles
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.drawingCtx.lineJoin = 'round';
        this.drawingCtx.lineCap = 'round';
        
        // Load background map image if specified
        const mapImagePath = this.canvas.dataset.mapImage;
        if (mapImagePath) {
            // Show loading state
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#666';
            this.ctx.textAlign = 'center';
            this.ctx.font = '16px Montserrat';
            this.ctx.fillText('Loading map...', this.canvas.width / 2, this.canvas.height / 2);

            const img = new Image();
            let retryCount = 0;
            const maxRetries = 3;
            
            img.onload = () => {
                this.backgroundImage = img;
                // Calculate base scale when image loads
                this.baseScale = Math.min(
                    this.canvas.width / img.width,
                    this.canvas.height / img.height
                );
                this.redrawCanvas();
            };
            
            img.onerror = (error) => {
                retryCount++;
                if (retryCount <= maxRetries) {
                    console.log(`Retrying image load (${retryCount}/${maxRetries})...`);
                    // Try alternative paths
                    const altPaths = [
                        `assets/images/Swanley_A1L_Reduced-1.png`,
                        `/assets/images/Swanley_A1L_Reduced-1.png`,
                        `/leaflet-tracker/assets/images/Swanley_A1L_Reduced-1.png`
                    ];
                    img.src = altPaths[retryCount - 1];
                    return;
                }

                // Show error state on canvas
                this.ctx.fillStyle = '#f0f0f0';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillStyle = '#666';
                this.ctx.textAlign = 'center';
                this.ctx.font = '16px Montserrat';
                this.ctx.fillText('Error loading map', this.canvas.width / 2, this.canvas.height / 2 - 20);
                this.ctx.font = '14px Montserrat';
                this.ctx.fillText('Map image not found. Please check image path:', this.canvas.width / 2, this.canvas.height / 2 + 10);
                this.ctx.fillText(mapImagePath, this.canvas.width / 2, this.canvas.height / 2 + 30);
                console.error('Map load error:', mapImagePath);
            };
            
            img.src = mapImagePath;
        }

        // Start animation loop
        this.startAnimationLoop();
    }

    startAnimationLoop() {
        const animate = () => {
            if (this.needsRedraw) {
                this.redrawCanvas();
                this.needsRedraw = false;
            }
            this.requestAnimationId = requestAnimationFrame(animate);
        };
        animate();
    }

    redrawCanvas() {
        // Clear main canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply transformations
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // Draw background image
        if (this.backgroundImage) {
            const x = (this.canvas.width / this.transform.scale - this.backgroundImage.width * this.baseScale) / 2;
            const y = (this.canvas.height / this.transform.scale - this.backgroundImage.height * this.baseScale) / 2;
            this.ctx.drawImage(
                this.backgroundImage,
                x, y,
                this.backgroundImage.width * this.baseScale,
                this.backgroundImage.height * this.baseScale
            );

            // Draw the drawing layer
            this.ctx.drawImage(
                this.drawingLayer,
                x, y,
                this.backgroundImage.width * this.baseScale,
                this.backgroundImage.height * this.baseScale
            );
        }
    }

    setupEventListeners() {
        // Drawing events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));

        // Tool selection
        document.getElementById('brush').addEventListener('click', () => this.setTool('brush'));
        document.getElementById('eraser').addEventListener('click', () => this.setTool('eraser'));
        document.getElementById('pan').addEventListener('click', () => this.setTool('pan'));
        
        // Color selection
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.color = e.target.value;
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => {
            const rect = this.canvas.getBoundingClientRect();
            this.zoom(1.1, rect.width / 2, rect.height / 2);
        });
        document.getElementById('zoomOut').addEventListener('click', () => {
            const rect = this.canvas.getBoundingClientRect();
            this.zoom(0.9, rect.width / 2, rect.height / 2);
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (e.deltaY < 0) {
                this.zoom(1.1, x, y);
            } else {
                this.zoom(0.9, x, y);
            }
        });

        // Window resize
        window.addEventListener('resize', this.setupCanvas.bind(this));

        // Brush size control
        document.getElementById('brushSize').addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            if (this.tool === 'eraser') {
                this.eraserSize = size * 2; // Eraser is double the brush size
            } else {
                this.brushSize = size;
            }
        });
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.lastMousePos = { x: e.clientX, y: e.clientY };

        if (this.tool === 'pan') {
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
        } else {
            this.startDrawing(e);
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'default';
        }
        this.stopDrawing();
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        
        // Get map offset for correct drawing position
        const offset = this.getMapOffset();
        const drawX = (pos.x - offset.x) * (this.drawingLayer.width / (this.backgroundImage.width * this.baseScale));
        const drawY = (pos.y - offset.y) * (this.drawingLayer.height / (this.backgroundImage.height * this.baseScale));
        
        // Configure drawing context based on tool
        if (this.tool === 'eraser') {
            this.drawingCtx.globalCompositeOperation = 'destination-out';
            this.drawingCtx.lineWidth = this.eraserSize;
        } else {
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.drawingCtx.strokeStyle = this.color;
            this.drawingCtx.lineWidth = this.brushSize;
        }
        
        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(drawX, drawY);
        this.lastDrawPoint = { x: drawX, y: drawY };
    }

    draw(e) {
        if (this.isPanning) {
            const deltaX = e.clientX - this.lastMousePos.x;
            const deltaY = e.clientY - this.lastMousePos.y;
            
            this.transform.offsetX += deltaX;
            this.transform.offsetY += deltaY;
            
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.redrawCanvas();
            return;
        }

        if (!this.isDrawing) {
            this.updateCursor(e);
            return;
        }
        
        const pos = this.getMousePos(e);
        const offset = this.getMapOffset();
        const drawX = (pos.x - offset.x) * (this.drawingLayer.width / (this.backgroundImage.width * this.baseScale));
        const drawY = (pos.y - offset.y) * (this.drawingLayer.height / (this.backgroundImage.height * this.baseScale));
        
        if (this.lastDrawPoint) {
            this.drawingCtx.beginPath();
            this.drawingCtx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
            // Add smooth line interpolation
            const dx = drawX - this.lastDrawPoint.x;
            const dy = drawY - this.lastDrawPoint.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 2) {
                const steps = Math.floor(dist / 2);
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = this.lastDrawPoint.x + dx * t;
                    const y = this.lastDrawPoint.y + dy * t;
                    this.drawingCtx.lineTo(x, y);
                }
            } else {
                this.drawingCtx.lineTo(drawX, drawY);
            }
            this.drawingCtx.stroke();
        }
        this.lastDrawPoint = { x: drawX, y: drawY };
        this.needsRedraw = true;
    }

    updateCursor(e) {
        const pos = this.getMousePos(e);
        
        // Clear cursor canvas
        this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
        
        // Apply same transform as main canvas
        this.cursorCtx.setTransform(
            this.transform.scale, 0,
            0, this.transform.scale,
            this.transform.offsetX, this.transform.offsetY
        );
        
        if (this.tool === 'eraser') {
            // Draw eraser cursor
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(pos.x, pos.y, this.eraserSize/2, 0, Math.PI * 2);
            this.cursorCtx.strokeStyle = '#000';
            this.cursorCtx.stroke();
            this.cursorCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.cursorCtx.fill();
        } else if (this.tool === 'brush') {
            // Draw brush cursor
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(pos.x, pos.y, this.brushSize/2, 0, Math.PI * 2);
            this.cursorCtx.strokeStyle = this.color;
            this.cursorCtx.stroke();
            this.cursorCtx.fillStyle = `${this.color}33`;
            this.cursorCtx.fill();
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.saveMapState();
        }
    }

    getMapOffset() {
        return {
            x: (this.canvas.width / this.transform.scale - this.backgroundImage.width * this.baseScale) / 2,
            y: (this.canvas.height / this.transform.scale - this.backgroundImage.height * this.baseScale) / 2
        };
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.transform.offsetX) / this.transform.scale,
            y: (e.clientY - rect.top - this.transform.offsetY) / this.transform.scale
        };
    }

    setTool(tool) {
        this.tool = tool;
        document.querySelectorAll('.tool').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool).classList.add('active');
        this.canvas.style.cursor = tool === 'pan' ? 'grab' : 'default';
    }

    zoom(factor, mouseX, mouseY) {
        // Switch to pan tool when zooming
        this.setTool('pan');
        
        // Calculate new scale
        const newScale = this.transform.scale * factor;
        
        // Limit zoom level
        if (newScale < 0.5 || newScale > 5) return;

        // Calculate mouse position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = mouseX - rect.left;
        const y = mouseY - rect.top;

        // Calculate new offsets to zoom towards cursor
        const scale = newScale / this.transform.scale;
        this.transform.offsetX = x - (x - this.transform.offsetX) * scale;
        this.transform.offsetY = y - (y - this.transform.offsetY) * scale;

        this.transform.scale = newScale;

        // Redraw canvas with new transformation
        this.redrawCanvas();
    }

    async saveToFirebase() {
        try {
            await this.mapRef.set({
                mapData: this.drawingLayer.toDataURL(),
                transform: this.transform,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Failed to save to Firebase:', error);
        }
    }

    async saveMapState() {
        // Save locally
        localStorage.setItem(window.location.pathname + '_mapData', this.canvas.toDataURL());
        localStorage.setItem(window.location.pathname + '_transform', JSON.stringify(this.transform));
        
        // Save to Firebase
        await this.saveToFirebase();
    }

    loadFromFirebase(data) {
        if (data.mapData) {
            const img = new Image();
            img.onload = () => {
                this.drawingCtx.clearRect(0, 0, this.drawingLayer.width, this.drawingLayer.height);
                this.drawingCtx.drawImage(img, 0, 0);
                if (data.transform) {
                    this.transform = data.transform;
                }
                this.redrawCanvas();
            };
            img.src = data.mapData;
            if (data.transform) {
                this.transform = data.transform;
            }
        }
    }

    cleanup() {
        if (this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId);
        }
        this.cursorCanvas.remove();
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
}); 