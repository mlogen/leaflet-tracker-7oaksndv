class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.isPanning = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.lastMousePos = { x: 0, y: 0 };
        this.backgroundImage = null;
        // Create overlay canvas for cursor preview
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.baseScale = 1;
        this.brushSize = 5;  // Fixed brush size
        this.eraserSize = 10;  // Fixed eraser size
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
                // Calculate scale to fit width
                this.baseScale = this.canvas.width / img.width;
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image
        if (this.backgroundImage) {
            // Draw at calculated scale to fit width
            const scaledHeight = this.backgroundImage.height * this.baseScale;
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                this.canvas.width,
                scaledHeight
            );

            // Draw the drawing layer at same scale
            this.ctx.drawImage(
                this.drawingLayer,
                0, 0,
                this.canvas.width,
                scaledHeight
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
        
        // Color selection
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.color = e.target.value;
        });

        // Window resize
        window.addEventListener('resize', this.setupCanvas.bind(this));
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.startDrawing(e);
    }

    handleMouseUp(e) {
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
        if (!this.isDrawing) {
            if (this.tool === 'eraser') {
                this.updateEraserPreview(e);
            }
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
            this.baseScale, 0,
            0, this.baseScale,
            0, 0
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
            x: (this.canvas.width - this.backgroundImage.width * this.baseScale) / 2,
            y: (this.canvas.height - this.backgroundImage.height * this.baseScale) / 2
        };
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.baseScale,
            y: (e.clientY - rect.top) / this.baseScale
        };
    }

    setTool(tool) {
        this.tool = tool;
        document.querySelectorAll('.tool').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool).classList.add('active');
        this.canvas.style.cursor = 'default';
    }

    async saveToFirebase() {
        try {
            await this.mapRef.set({
                mapData: this.drawingLayer.toDataURL(),
                transform: {
                    scale: this.baseScale,
                    offsetX: 0,
                    offsetY: 0
                },
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Failed to save to Firebase:', error);
        }
    }

    async saveMapState() {
        // Save locally
        localStorage.setItem(window.location.pathname + '_mapData', this.canvas.toDataURL());
        localStorage.setItem(window.location.pathname + '_transform', JSON.stringify({
            scale: this.baseScale,
            offsetX: 0,
            offsetY: 0
        }));
        
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
                    this.baseScale = data.transform.scale;
                }
                this.redrawCanvas();
            };
            img.src = data.mapData;
            if (data.transform) {
                this.baseScale = data.transform.scale;
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