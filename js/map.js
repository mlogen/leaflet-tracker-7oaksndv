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
        // Set initial canvas width
        this.canvas.width = this.canvas.offsetWidth;
        this.drawingLayer.width = this.canvas.width;
        
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
                // Set initial height based on aspect ratio
                const scale = this.canvas.width / img.width;
                const scaledHeight = img.height * scale;
                this.canvas.height = scaledHeight;
                this.drawingLayer.height = scaledHeight;
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
        // Drawing events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling while drawing
            const touch = e.touches[0];
            this.handleMouseDown(touch);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.draw(touch);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp(e);
        });

        // Completely disable double-click
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.canvas.addEventListener('selectstart', (e) => e.preventDefault());
        this.canvas.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.detail > 1) e.preventDefault();
        }, { passive: false });

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
        // Calculate the scale between displayed size and actual size
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        // Handle both mouse and touch events
        const clientX = e.clientX || e.pageX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY || e.pageY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
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
            // Get the container width
            const containerWidth = this.canvas.parentElement.clientWidth - 40; // Account for padding
            
            // Calculate scale while maintaining aspect ratio
            const scale = containerWidth / this.backgroundImage.width;
            
            // Store current drawing
            const drawingData = this.drawingLayer.toDataURL();
            
            // Update canvas and layer dimensions
            this.canvas.width = containerWidth;
            this.canvas.height = this.backgroundImage.height * scale;
            this.drawingLayer.width = containerWidth;
            this.drawingLayer.height = this.backgroundImage.height * scale;
            
            // Redraw background
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                containerWidth,
                this.backgroundImage.height * scale
            );
            
            // Restore drawing
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