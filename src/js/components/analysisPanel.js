class AnalysisPanel {
    constructor() {
        this.panel = null;
        this.isVisible = false;
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.className = 'subtitle-analysis-panel';
        panel.innerHTML = `
            <div class="analysis-header">
                <h3>字幕解析</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="analysis-content">
                <div class="loading-indicator" style="display: none;">
                    <div class="spinner"></div>
                    <span>正在分析字幕...</span>
                </div>
                <div class="analysis-results"></div>
            </div>
        `;

        // 添加关闭按钮事件
        panel.querySelector('.close-btn').addEventListener('click', () => {
            this.hidePanel();
        });

        document.body.appendChild(panel);
        this.panel = panel;
    }

    showPanel() {
        if (!this.panel) {
            this.createPanel();
        }
        this.panel.classList.add('visible');
        this.isVisible = true;
    }

    hidePanel() {
        if (this.panel) {
            this.panel.classList.remove('visible');
            this.isVisible = false;
        }
    }

    setLoading(loading) {
        if (!this.panel) return;
        
        const loadingIndicator = this.panel.querySelector('.loading-indicator');
        const resultsContainer = this.panel.querySelector('.analysis-results');
        
        loadingIndicator.style.display = loading ? 'flex' : 'none';
        resultsContainer.style.display = loading ? 'none' : 'block';
    }

    renderResults(results) {
        if (!this.panel) return;

        const resultsContainer = this.panel.querySelector('.analysis-results');
        resultsContainer.innerHTML = results.map(item => this.createAnalysisCard(item)).join('');
    }

    createAnalysisCard(item) {
        return `
            <div class="analysis-card">
                <div class="card-header">
                    <span class="expression">${item.expression}</span>
                    <div class="tags">
                        <span class="tag type">${item.type}</span>
                        <span class="tag difficulty">${item.difficulty}</span>
                        <span class="tag speech">${item.part_of_speech}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="phonetic">${item.phonetic}</div>
                    <div class="meaning">${item.chinese_meaning}</div>
                    <div class="memory-method">
                        <strong>记忆方法：</strong>
                        <p>${item.memory_method}</p>
                    </div>
                    <div class="source">
                        <strong>出处：</strong>
                        <p>${item.source_sentence}</p>
                        <p class="translation">${item.source_translation}</p>
                    </div>
                </div>
            </div>
        `;
    }
}

export default AnalysisPanel; 