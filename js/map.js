class MapEditor {
    constructor() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
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
        this.drawingCanvas = document.createElement('canvas');
        this.drawingCtx = this.drawingCanvas.getContext('2d');
        this.baseScale = 1; // Store the initial scale of the map

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

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Set canvas size to match display size
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawingCanvas.width = this.canvas.width;
        this.drawingCanvas.height = this.canvas.height;

        // Set default styles
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = 10;
        
        this.drawingCtx.lineJoin = 'round';
        this.drawingCtx.lineCap = 'round';
        this.drawingCtx.lineWidth = 10;

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
    }

    redrawCanvas() {
        // Clear main canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save the current global alpha
        const currentAlpha = this.drawingCtx.globalAlpha;
        this.drawingCtx.globalAlpha = 1;

        // Apply transformations
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // Draw background image if available
        if (this.backgroundImage) {
            const x = (this.canvas.width / this.transform.scale - this.backgroundImage.width * this.baseScale) / 2;
            const y = (this.canvas.height / this.transform.scale - this.backgroundImage.height * this.baseScale) / 2;
            this.ctx.drawImage(
                this.backgroundImage,
                x, y,
                this.backgroundImage.width * this.baseScale,
                this.backgroundImage.height * this.baseScale
            );

            // Draw the drawing canvas with the same transform
            this.ctx.globalAlpha = 0.5;  // Set consistent transparency for all strokes
            this.ctx.drawImage(
                this.drawingCanvas,
                x, y,
                this.backgroundImage.width * this.baseScale,
                this.backgroundImage.height * this.baseScale
            );
            this.ctx.globalAlpha = 1;  // Reset transparency
        }

        // Restore the previous global alpha
        this.drawingCtx.globalAlpha = currentAlpha;
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
        
        // Set line width based on tool
        this.drawingCtx.lineWidth = this.tool === 'eraser' ? 20 : 10;
        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(
            (pos.x - this.getMapOffset().x) * (this.drawingCanvas.width / (this.backgroundImage.width * this.baseScale)),
            (pos.y - this.getMapOffset().y) * (this.drawingCanvas.height / (this.backgroundImage.height * this.baseScale))
        );
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

        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        this.drawingCtx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
        this.drawingCtx.strokeStyle = this.tool === 'eraser' ? '#000000' : this.color;
        this.drawingCtx.globalAlpha = 1;  // Draw at full opacity on drawing canvas
        this.drawingCtx.lineTo(
            (pos.x - this.getMapOffset().x) * (this.drawingCanvas.width / (this.backgroundImage.width * this.baseScale)),
            (pos.y - this.getMapOffset().y) * (this.drawingCanvas.height / (this.backgroundImage.height * this.baseScale))
        );
        this.drawingCtx.stroke();
        
        // Start a new path to prevent connecting lines
        this.drawingCtx.beginPath();
        this.drawingCtx.moveTo(
            (pos.x - this.getMapOffset().x) * (this.drawingCanvas.width / (this.backgroundImage.width * this.baseScale)),
            (pos.y - this.getMapOffset().y) * (this.drawingCanvas.height / (this.backgroundImage.height * this.baseScale))
        );
        
        this.redrawCanvas();
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
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
                mapData: this.drawingCanvas.toDataURL(),
                transform: this.transform,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Failed to save to Firebase:', error);
        }
    }

    async saveMapState() {
        // Save locally
        localStorage.setItem(window.location.pathname + '_mapData', this.drawingCanvas.toDataURL());
        localStorage.setItem(window.location.pathname + '_transform', JSON.stringify(this.transform));
        
        // Save to Firebase
        await this.saveToFirebase();
    }

    loadFromFirebase(data) {
        if (data.mapData) {
            const img = new Image();
            img.onload = () => {
                this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
                this.drawingCtx.drawImage(img, 0, 0);
                if (data.transform) {
                    this.transform = data.transform;
                }
                this.redrawCanvas();
            };
            img.src = data.mapData;
        }
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
}); 