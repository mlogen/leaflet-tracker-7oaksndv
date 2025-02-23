class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.backgroundImage = null;
        this.brushSize = 10;
        this.eraserSize = 30;
        this.lastDrawPoint = null;
        this.isErasing = false;
        this.lastDrawingState = null; // Store last valid drawing state
        
        // Create a separate layer for drawings
        this.drawingLayer = document.createElement('canvas');
        this.drawingCtx = this.drawingLayer.getContext('2d');

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

        // Performance optimizations
        this.requestAnimationId = null;
        this.needsRedraw = false;

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Get container width without padding
        const containerWidth = this.canvas.parentElement.clientWidth - 40;
        
        // Set initial dimensions
        this.canvas.width = containerWidth;
        this.drawingLayer.width = containerWidth;
        
        // Set default styles
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.drawingCtx.lineJoin = 'round';
        this.drawingCtx.lineCap = 'round';
        
        // Load background map image if specified
        const mapImagePath = this.canvas.dataset.mapImage;
        if (mapImagePath) {
            const img = new Image();
            img.onload = () => {
                this.backgroundImage = img;
                
                // Calculate scale to maintain aspect ratio
                const scale = containerWidth / img.width;
                const scaledHeight = img.height * scale;
                
                // Set dimensions
                this.canvas.height = scaledHeight;
                this.drawingLayer.height = scaledHeight;
                
                // Initial draw
                this.ctx.drawImage(
                    this.backgroundImage,
                    0, 0,
                    containerWidth,
                    scaledHeight
                );
                this.redrawCanvas();
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
            const scale = this.canvas.width / this.backgroundImage.width;
            const scaledHeight = this.backgroundImage.height * scale;
            
            // Draw background image
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                this.canvas.width,
                scaledHeight
            );

            // Draw the drawing layer at same scale
            this.ctx.drawImage(this.drawingLayer, 0, 0);
        }
    }

    setupEventListeners() {
        // Prevent double-click on the entire canvas
        this.canvas.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, { capture: true });

        // Prevent double-click selection
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.canvas.style.msUserSelect = 'none';
        this.canvas.style.webkitTouchCallout = 'none';
        
        this.canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (e.detail > 1) { // Prevent multi-clicks
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            this.handleStart(e);
        }, { capture: true });

        this.canvas.addEventListener('pointermove', (e) => {
            e.preventDefault();
            this.handleMove(e);
        });

        this.canvas.addEventListener('pointerup', (e) => {
            e.preventDefault();
            this.handleEnd(e);
        });

        this.canvas.addEventListener('pointerout', (e) => {
            e.preventDefault();
            this.handleEnd(e);
        });

        // Tool selection
        document.getElementById('brush').addEventListener('click', () => this.setTool('brush'));
        document.getElementById('eraser').addEventListener('click', () => this.setTool('eraser'));
        
        // Color selection
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.color = e.target.value;
        });

        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
        window.addEventListener('orientationchange', this.handleResize.bind(this));
    }

    handleStart(e) {
        // Store current state before starting new action
        this.lastDrawingState = this.drawingLayer.toDataURL();
        
        this.isDrawing = true;
        const pos = this.getPointerPos(e);
        this.lastDrawPoint = pos;
        
        // Configure context based on tool
        if (this.tool === 'eraser') {
            this.isErasing = true;
            this.drawingCtx.globalCompositeOperation = 'destination-out';
            this.drawingCtx.lineWidth = this.eraserSize;
        } else {
            this.isErasing = false;
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.drawingCtx.lineWidth = this.brushSize;
            this.drawingCtx.strokeStyle = this.color;
        }
        
        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(pos.x, pos.y);
    }

    handleMove(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getPointerPos(e);
        if (this.lastDrawPoint) {
            this.drawingCtx.beginPath();
            this.drawingCtx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
            this.drawingCtx.lineTo(pos.x, pos.y);
            this.drawingCtx.stroke();
            this.redrawCanvas();
        }
        this.lastDrawPoint = pos;
    }

    handleEnd(e) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.isErasing = false;
            this.drawingCtx.globalCompositeOperation = 'source-over';
            // Only save state if something actually changed
            if (this.lastDrawingState !== this.drawingLayer.toDataURL()) {
                this.saveMapState();
            }
        }
    }

    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
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
                mapData: this.canvas.toDataURL(),
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Failed to save to Firebase:', error);
        }
    }

    async saveMapState() {
        // Save locally
        localStorage.setItem(window.location.pathname + '_mapData', this.canvas.toDataURL());
        
        // Save to Firebase
        await this.saveToFirebase();
    }

    loadFromFirebase(data) {
        if (data.mapData) {
            const img = new Image();
            img.onload = () => {
                this.drawingCtx.clearRect(0, 0, this.drawingLayer.width, this.drawingLayer.height);
                this.drawingCtx.drawImage(img, 0, 0);
                this.redrawCanvas();
            };
            img.src = data.mapData;
        }
    }

    cleanup() {
        if (this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId);
        }
    }

    handleResize() {
        if (this.backgroundImage) {
            // Get the actual container width
            const container = this.canvas.parentElement;
            const containerWidth = container.clientWidth - 
                parseFloat(getComputedStyle(container).paddingLeft) - 
                parseFloat(getComputedStyle(container).paddingRight);
            
            // Calculate scale while maintaining aspect ratio
            const scale = containerWidth / this.backgroundImage.width;
            const scaledHeight = this.backgroundImage.height * scale;
            
            // Store current drawing
            const drawingData = this.drawingLayer.toDataURL();
            
            // Update dimensions
            this.canvas.width = containerWidth;
            this.canvas.height = scaledHeight;
            this.drawingLayer.width = containerWidth;
            this.drawingLayer.height = scaledHeight;
            
            // Redraw everything
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                containerWidth,
                scaledHeight
            );
            
            const img = new Image();
            img.onload = () => {
                this.drawingCtx.drawImage(img, 0, 0);
                this.redrawCanvas();
            };
            img.src = drawingData;
        }
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
}); 