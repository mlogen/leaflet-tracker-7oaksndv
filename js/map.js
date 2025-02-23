class MapEditor {
    constructor() {
        // Check if mobile and show message
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            document.body.innerHTML = '<div class="mobile-message">Mobile devices are not supported</div>';
            return;
        }

        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.isDrawing = false;
        this.tool = 'brush';
        this.color = '#FF0000';
        this.backgroundImage = null;
        this.brushSize = 10;
        this.eraserSize = 30;
        this.lastDrawPoint = null;
        
        // Create drawing layer
        this.drawingLayer = document.createElement('canvas');
        this.drawingCtx = this.drawingLayer.getContext('2d');

        // Initialize Firebase
        const app = firebase.initializeApp(firebaseConfig);
        this.db = firebase.database();
        this.setupFirebase();
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupFirebase() {
        // Create a unique identifier for each page
        const pathMap = {
            '/': 'swanley',
            '/index.html': 'swanley',
            '/pages/sevenoaks-north.html': 'sevenoaks-north',
            '/pages/sevenoaks-rural-ne.html': 'sevenoaks-rural-ne',
            '/pages/sevenoaks-town.html': 'sevenoaks-town',
            '/pages/sevenoaks-west.html': 'sevenoaks-west',
            '/pages/sevenoaks-rural-s.html': 'sevenoaks-rural-s'
        };
        
        const pageId = pathMap[window.location.pathname] || 'default';
        this.mapRef = this.db.ref('maps/' + pageId);

        // Listen for real-time updates
        this.mapRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && (!this.lastSync || data.timestamp > this.lastSync)) {
                this.loadFromFirebase(data);
                this.lastSync = data.timestamp;
            }
        });
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth - 40;
        
        const mapImagePath = this.canvas.dataset.mapImage;
        if (mapImagePath) {
            const img = new Image();
            // Always set crossOrigin
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.backgroundImage = img;
                
                // Calculate scale to fit width while maintaining aspect ratio
                const scale = Math.min(maxWidth / img.width, 1);
                const scaledHeight = img.height * scale;
                const scaledWidth = img.width * scale;
                
                // Set dimensions
                this.canvas.width = scaledWidth;
                this.canvas.height = scaledHeight;
                this.drawingLayer.width = scaledWidth;
                this.drawingLayer.height = scaledHeight;
                
                // Initial draw
                this.redrawCanvas();
               
                // Load any existing drawings after background is loaded
                this.loadExistingDrawing();
            };
            img.onerror = (error) => {
                console.error('Error loading image:', error);
                alert('Please use a local server (like Live Server) to run this application');
            };
            img.src = mapImagePath;
        }
    }

    setupEventListeners() {
        // Drawing events
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startDrawing(e);
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            this.draw(e);
        });
        
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Tool selection
        document.getElementById('brush').addEventListener('click', () => this.setTool('brush'));
        document.getElementById('eraser').addEventListener('click', () => this.setTool('eraser'));
        
        // Color selection
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.color = e.target.value;
        });

        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getPointerPos(e);
        this.lastDrawPoint = pos;
        
        // Configure context based on tool
        if (this.tool === 'eraser') {
            this.drawingCtx.globalCompositeOperation = 'destination-out';
            this.drawingCtx.lineWidth = this.eraserSize;
        } else {
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.drawingCtx.lineWidth = this.brushSize;
            this.drawingCtx.strokeStyle = this.color;
        }
        
        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(pos.x, pos.y);
    }

    draw(e) {
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

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.drawingCtx.globalCompositeOperation = 'source-over';
            this.saveMapState();
        }
    }

    redrawCanvas() {
        // Clear main canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image
        if (this.backgroundImage) {
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );

            this.ctx.drawImage(this.drawingLayer, 0, 0);
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
        try {
            // Save locally
            localStorage.setItem(window.location.pathname + '_mapData', this.drawingLayer.toDataURL());
            
            // Save to Firebase
            await this.mapRef.set({
                mapData: this.drawingLayer.toDataURL(),
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Failed to save map state:', error);
            alert('Error saving changes. Please ensure you are using a local server.');
        }
    }

    loadFromFirebase(data) {
        if (data.mapData) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.drawingCtx.clearRect(0, 0, this.drawingLayer.width, this.drawingLayer.height);
                this.drawingCtx.drawImage(img, 0, 0);
                this.redrawCanvas();
            };
            img.onerror = (error) => {
                console.error('Error loading from Firebase:', error);
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
            // Get container dimensions
            const container = this.canvas.parentElement;
            const maxWidth = container.clientWidth - 40;
            
            // Calculate scale while maintaining aspect ratio
            const scale = Math.min(maxWidth / this.backgroundImage.width, 1);
            const scaledHeight = this.backgroundImage.height * scale;
            const scaledWidth = this.backgroundImage.width * scale;
            
            // Create temporary canvas to store current drawing
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.drawingLayer.width;
            tempCanvas.height = this.drawingLayer.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.drawingLayer, 0, 0);
            
            // Update dimensions
            this.canvas.width = scaledWidth;
            this.canvas.height = scaledHeight;
            this.drawingLayer.width = scaledWidth;
            this.drawingLayer.height = scaledHeight;
            
            // Draw background
            this.ctx.drawImage(
                this.backgroundImage,
                0, 0,
                scaledWidth,
                scaledHeight
            );
            
            // Draw existing drawing content scaled to new size
            this.drawingCtx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);
            this.redrawCanvas();
        }
    }

    loadExistingDrawing() {
        this.mapRef.once('value').then((snapshot) => {
            const data = snapshot.val();
            if (data && data.mapData) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    this.drawingCtx.drawImage(img, 0, 0);
                    this.redrawCanvas();
                };
                img.src = data.mapData;
            }
        });
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
}); 