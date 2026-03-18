export class MainMenu {
    /**
     * @param {Function} onSelectMode Callback fired when the player clicks an active mode button.
     */
    constructor(onSelectMode) {
        this.onSelectMode = onSelectMode;
        this.container = null;
    }

    show() {
        if (this.container) return;

        // Create main container overlay
        this.container = document.createElement('div');
        this.container.id = 'main-menu-overlay';
        
        // Inject Anime-style CSS
        const style = document.createElement('style');
        style.innerHTML = `
            #main-menu-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: linear-gradient(135deg, rgba(15, 12, 41, 0.95) 0%, rgba(48, 43, 99, 0.95) 50%, rgba(36, 36, 62, 0.95) 100%);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                font-family: 'Segoe UI', Impact, sans-serif;
                color: white;
                overflow: hidden;
            }
            .anime-title {
                font-size: 5rem;
                font-style: italic;
                font-weight: 900;
                text-transform: uppercase;
                background: -webkit-linear-gradient(#ff007f, #ff7f00);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 2px 2px 20px rgba(255, 0, 127, 0.6);
                margin-bottom: 60px;
                letter-spacing: 6px;
                transform: skewX(-10deg);
            }
            .menu-btn {
                background: rgba(5, 0, 15, 0.9);
                border: 3px solid;
                border-image: linear-gradient(45deg, #c0c0c0, #ffd700, #c0c0c0) 1;
                color: #ffd700;
                font-size: 1.6rem;
                font-weight: 900;
                font-style: italic;
                padding: 18px 45px;
                margin: 14px;
                cursor: pointer;
                width: 380px;
                text-transform: uppercase;
                transition: all 0.3s cubic-bezier(0.25,0.46,0.45,0.94);
                transform: skewX(-12deg);
                box-shadow: 0 0 20px rgba(255,215,0,0.3), inset 0 0 20px rgba(255,255,255,0.1);
                animation: chromeShine 4s linear infinite;
                position: relative;
                overflow: hidden;
            }
            .menu-btn:hover {
                background: #00f3ff;
                color: #000;
                box-shadow: 0 0 25px rgba(0, 243, 255, 0.9);
                transform: skewX(-15deg) scale(1.05);
            }
            .menu-btn.disabled {
                border-color: #555;
                color: #555;
                cursor: not-allowed;
                box-shadow: none;
            }
            .menu-btn.disabled:hover {
                background: rgba(0, 0, 0, 0.5);
                color: #555;
                transform: skewX(-15deg);
            }
            .menu-btn span {
                display: block;
                transform: skewX(15deg); /* Counter-skew text to keep it readable */
            }
        `;
        this.container.appendChild(style);

        // Title
        const title = document.createElement('h1');
        title.className = 'anime-title';
        title.innerText = 'WORLDS STRONGEST';
        this.container.appendChild(title);

        // Menu Options (Placeholders for future modes)
        const modes = [
            { id: 'story', name: 'Story Mode', active: true },
            { id: 'versus', name: 'Versus Mode', active: false },
            { id: 'training', name: 'Training', active: true },
            { id: 'settings', name: 'Settings', active: false }
        ];

        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = `menu-btn ${mode.active ? '' : 'disabled'}`;
            
            const span = document.createElement('span');
            span.innerText = mode.active ? mode.name : `${mode.name} (Locked)`;
            btn.appendChild(span);

            if (mode.active) {
                btn.addEventListener('click', () => {
                    this.hide();
                    if (this.onSelectMode) this.onSelectMode(mode.id);
                });
            }
            this.container.appendChild(btn);
        });

        document.body.appendChild(this.container);
    }

    hide() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}