class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.backgroundImage = null;
        this.brushSize = 5;  // Fixed brush size
        this.eraserSize = 10;  // Fixed eraser size
        this.lastDrawPoint = null;
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));

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

    handleResize() {
        if (this.backgroundImage) {
            // Store current canvas state
            const currentState = this.canvas.toDataURL();
            
            // Resize canvas
            this.canvas.width = this.canvas.offsetWidth;
            const scale = this.canvas.width / this.backgroundImage.width;
            const scaledHeight = this.backgroundImage.height * scale;
            this.canvas.height = scaledHeight;
            
            // Restore canvas state
            const img = new Image();
            img.onload = () => {
                this.ctx.drawImage(img, 0, 0, this.canvas.width, scaledHeight);
            };
            img.src = currentState;
        }
    }

    setupCanvas() {
        // Set initial canvas width
        this.canvas.width = this.canvas.offsetWidth;
        
        // Set default styles
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        
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
                this.ctx.drawImage(img, 0, 0, this.canvas.width, scaledHeight);
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
            // Calculate dimensions that maintain aspect ratio
            const scale = this.canvas.width / this.backgroundImage.width;
            const scaledHeight = this.backgroundImage.height * scale;
            
            // Update canvas height to match scaled image
            this.canvas.height = scaledHeight;
            
            this.ctx.drawImage(
                this.backgroundImage,
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
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = this.eraserSize;
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.brushSize;
        }
        
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        this.lastDrawPoint = pos;
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        if (this.lastDrawPoint) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
        }
        this.lastDrawPoint = pos;
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.globalCompositeOperation = 'source-over';
            this.saveMapState();
        }
    }

    getMousePos(e) {
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
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
            };
            img.src = data.mapData;
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