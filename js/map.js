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
        this.apiEndpoint = 'https://your-backend-service.com/api/maps';
        
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
        this.ctx.globalAlpha = 0.5;
        
        this.drawingCtx.lineJoin = 'round';
        this.drawingCtx.lineCap = 'round';
        this.drawingCtx.lineWidth = 10;
        this.drawingCtx.globalAlpha = 0.5;

        // Load background map image if specified
        const mapImagePath = this.canvas.dataset.mapImage;
        if (mapImagePath) {
            const img = new Image();
            img.onload = () => {
                this.backgroundImage = img;
                // Calculate base scale when image loads
                this.baseScale = Math.min(
                    this.canvas.width / img.width,
                    this.canvas.height / img.height
                );
                this.redrawCanvas();
            };
            img.src = mapImagePath;
        }
    }

    redrawCanvas() {
        // Clear main canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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
            this.ctx.drawImage(
                this.drawingCanvas,
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

        // Add periodic sync
        setInterval(() => this.checkForUpdates(), 5000); // Check every 5 seconds
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
        this.drawingCtx.strokeStyle = this.color;
        this.drawingCtx.lineTo(
            (pos.x - this.getMapOffset().x) * (this.drawingCanvas.width / (this.backgroundImage.width * this.baseScale)),
            (pos.y - this.getMapOffset().y) * (this.drawingCanvas.height / (this.backgroundImage.height * this.baseScale))
        );
        this.drawingCtx.stroke();
        
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

    async syncWithServer() {
        const mapData = this.drawingCanvas.toDataURL();
        const pageId = window.location.pathname;
        
        try {
            await fetch(`${this.apiEndpoint}/${pageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mapData,
                    transform: this.transform
                })
            });
        } catch (error) {
            console.error('Failed to sync with server:', error);
        }
    }

    async saveMapState() {
        // Save locally first
        localStorage.setItem(window.location.pathname + '_mapData', this.drawingCanvas.toDataURL());
        localStorage.setItem(window.location.pathname + '_transform', JSON.stringify(this.transform));
        
        // Then sync with server
        await this.syncWithServer();
    }

    async checkForUpdates() {
        try {
            const response = await fetch(`${this.apiEndpoint}/${window.location.pathname}`);
            const serverData = await response.json();
            
            if (serverData.lastModified > this.lastSync) {
                // Load new data
                const img = new Image();
                img.onload = () => {
                    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
                    this.drawingCtx.drawImage(img, 0, 0);
                    this.transform = serverData.transform;
                    this.redrawCanvas();
                };
                img.src = serverData.mapData;
                this.lastSync = serverData.lastModified;
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }

    loadMapState() {
        const mapData = localStorage.getItem(window.location.pathname + '_mapData');
        const savedTransform = localStorage.getItem(window.location.pathname + '_transform');

        if (savedTransform) {
            this.transform = JSON.parse(savedTransform);
        }

        if (mapData) {
            const img = new Image();
            img.onload = () => {
                this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
                this.drawingCtx.drawImage(img, 0, 0);
                this.redrawCanvas();
            };
            img.src = mapData;
        }
    }
}

// Initialize the map editor when the page loads
window.addEventListener('load', () => {
    new MapEditor();
}); 