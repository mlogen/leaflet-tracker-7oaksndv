class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.backgroundImage = null;
        this.brushSize = 10;  // Increased brush size by 100%
        this.eraserSize = 30;  // Increased eraser size by 200%
        this.lastDrawPoint = null;
        
        // Create cursor feedback layer
        this.cursorLayer = document.createElement('canvas');
        this.cursorLayer.style.position = 'absolute';
        this.cursorLayer.style.pointerEvents = 'none';
        this.cursorLayer.style.zIndex = '1000'; // Ensure cursor is on top
        this.cursorCtx = this.cursorLayer.getContext('2d');

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

        // Bind the resize handler to this instance
        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
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
                // Set canvas to image's natural dimensions
                this.canvas.width = img.naturalWidth;
                this.canvas.height = img.naturalHeight;
                this.drawingLayer.width = img.naturalWidth;
                this.drawingLayer.height = img.naturalHeight;
                
                // Setup cursor layer with same dimensions
                this.cursorLayer.width = img.naturalWidth;
                this.cursorLayer.height = img.naturalHeight;
                
                // Position cursor layer
                const rect = this.canvas.getBoundingClientRect();
                this.cursorLayer.style.left = rect.left + 'px';
                this.cursorLayer.style.top = rect.top + 'px';
                this.canvas.parentNode.appendChild(this.cursorLayer);

                // Draw initial background at original size
                this.ctx.drawImage(
                    this.backgroundImage,
                    0, 0,
                    img.naturalWidth,
                    img.naturalHeight
                );
                
                this.redrawCanvas();
            };
            img.onerror = (error) => {
                console.error('Error loading image:', error);
                console.log('Attempted image path:', mapImagePath);
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
            // Draw at original size
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                this.backgroundImage.naturalWidth,
                this.backgroundImage.naturalHeight
            );

            // Draw the drawing layer at same size
            this.ctx.drawImage(this.drawingLayer, 0, 0);
        }
    }

    setupEventListeners() {
        // Drawing events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', (e) => {
            this.draw(e);
            this.updateCursor(e);
        });
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', (e) => {
            this.handleMouseUp(e);
            this.cursorCtx.clearRect(0, 0, this.cursorLayer.width, this.cursorLayer.height);
        });
        this.canvas.addEventListener('mouseenter', (e) => {
            this.updateCursor(e);
        });

        // Tool selection
        document.getElementById('brush').addEventListener('click', () => this.setTool('brush'));
        document.getElementById('eraser').addEventListener('click', () => this.setTool('eraser'));
        
        // Color selection
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.color = e.target.value;
            if (this.tool === 'brush') {
                this.updateCursor({ clientX: this.lastX, clientY: this.lastY });
            }
        });
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
        this.drawingCtx.moveTo(pos.x, pos.y);
        this.lastDrawPoint = pos;
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        if (this.lastDrawPoint) {
            this.drawingCtx.beginPath();
            this.drawingCtx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
            this.drawingCtx.lineTo(pos.x, pos.y);
            this.drawingCtx.stroke();
            this.redrawCanvas();
        }
        this.lastDrawPoint = pos;
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.saveMapState();
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
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

    updateCursor(e) {
        const pos = this.getMousePos(e);
        this.lastX = e.clientX; // Store last mouse position
        this.lastY = e.clientY;
        
        // Clear previous cursor
        this.cursorCtx.clearRect(0, 0, this.cursorLayer.width, this.cursorLayer.height);
        
        // Save current line width and style
        const currentLineWidth = this.cursorCtx.lineWidth;
        this.cursorCtx.lineWidth = 1;
        
        // Draw new cursor
        this.cursorCtx.beginPath();
        this.cursorCtx.arc(pos.x, pos.y, 
            this.tool === 'eraser' ? this.eraserSize/2 : this.brushSize/2, 
            0, Math.PI * 2);
        
        if (this.tool === 'eraser') {
            this.cursorCtx.strokeStyle = '#000';
            this.cursorCtx.fillStyle = 'rgba(255,255,255,0.3)';
        } else {
            this.cursorCtx.strokeStyle = this.color;
            this.cursorCtx.fillStyle = `${this.color}33`;  // 20% opacity
        }
        
        this.cursorCtx.stroke();
        this.cursorCtx.fill();
        
        // Restore line width
        this.cursorCtx.lineWidth = currentLineWidth;
    }

    handleResize() {
        if (this.canvas && this.cursorLayer) {
            const rect = this.canvas.getBoundingClientRect();
            this.cursorLayer.style.left = rect.left + 'px';
            this.cursorLayer.style.top = rect.top + 'px';
            this.cursorLayer.width = this.canvas.width;
            this.cursorLayer.height = this.canvas.height;
        }
    }

    cleanup() {
        if (this.requestAnimationId) {
            cancelAnimationFrame(this.requestAnimationId);
        }
        window.removeEventListener('resize', this.handleResize);
        this.cursorLayer.remove();
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
});

// Add window resize handler to keep cursor layer aligned
window.addEventListener('resize', () => {
    if (this.canvas && this.cursorLayer) {
        const rect = this.canvas.getBoundingClientRect();
        this.cursorLayer.style.left = rect.left + 'px';
        this.cursorLayer.style.top = rect.top + 'px';
    }
}); 