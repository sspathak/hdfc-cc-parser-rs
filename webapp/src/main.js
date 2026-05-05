import { AnalysisEngine } from './analysis.js';

// DOM Elements
const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('nav button');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const passwordInput = document.getElementById('password-input');
const processBtn = document.getElementById('process-btn');
const resultsArea = document.getElementById('results-area');
const statusContainer = document.getElementById('status-container');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');

// State
let selectedFiles = [];
const engine = new AnalysisEngine();
let worker = null;
let currentTransactions = [];

// Initialize Worker
function initWorker() {
    if (worker) worker.terminate();
    // Using Vite's worker constructor
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
        const { type, transactions, message, current, total, fileName } = e.data;
        
        if (type === 'progress') {
            const percent = (current / total) * 100;
            progressFill.style.width = `${percent}%`;
            statusText.textContent = `Parsing ${fileName} (${current}/${total})...`;
        } else if (type === 'done') {
            statusContainer.classList.add('hidden');
            displayResults(transactions);
        } else if (type === 'error') {
            statusContainer.classList.add('hidden');
            alert(`Error: ${message}`);
            processBtn.disabled = false;
        }
    };
}

// Navigation
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = `view-${btn.id.split('-')[1]}`;
        views.forEach(v => v.classList.add('hidden'));
        document.getElementById(targetView).classList.remove('hidden');
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (targetView === 'view-categories') renderCategoryEditor();
    });
});

// File Handling
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(files) {
    selectedFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (selectedFiles.length > 0) {
        dropZone.querySelector('p').innerHTML = `Selected <span>${selectedFiles.length} files</span>`;
        checkReady();
    }
}

passwordInput.addEventListener('input', checkReady);

function checkReady() {
    processBtn.disabled = !(selectedFiles.length > 0 && passwordInput.value.length > 0);
}

// Processing
processBtn.addEventListener('click', () => {
    if (!worker) initWorker();
    
    processBtn.disabled = true;
    resultsArea.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    
    worker.postMessage({
        files: selectedFiles,
        password: passwordInput.value
    });
});

function displayResults(transactions) {
    currentTransactions = transactions;
    const results = engine.process(transactions);
    
    document.getElementById('total-spent').textContent = `₹${results.summary.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('total-points').textContent = results.summary.totalPoints.toLocaleString();
    document.getElementById('total-count').textContent = results.summary.totalCount;
    
    resultsArea.classList.remove('hidden');
    renderCharts(results.chartData);
}

// Charting
let trendChart = null;
let categoryChart = null;

async function renderCharts(chartData) {
    // Wait for Chart.js to be available if loaded via script tag
    // Or if imported, use the import. For simplicity and SRI, we might use script tag in index.html
    // but here we'll assume it's available globally or we import it.
    
    const Chart = window.Chart;
    if (!Chart) {
        console.error("Chart.js not found");
        return;
    }

    if (trendChart) trendChart.destroy();
    if (categoryChart) categoryChart.destroy();

    const trendCtx = document.getElementById('trend-chart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: chartData.months,
            datasets: [{
                label: 'Total Spending',
                data: chartData.totals,
                backgroundColor: '#4f46e5',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const catCtx = document.getElementById('category-chart').getContext('2d');
    categoryChart = new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: chartData.categoryData.map(d => d.label),
            datasets: [{
                data: chartData.categoryData.map(d => d.data.reduce((a, b) => a + b, 0)),
                backgroundColor: [
                    '#4f46e5', '#10b981', '#f59e0b', '#ef4444', 
                    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'right' } }
        }
    });
}

// Category Editor
function renderCategoryEditor() {
    const list = document.getElementById('category-list');
    list.innerHTML = '';
    
    Object.entries(engine.categories).forEach(([name, patterns]) => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.innerHTML = `
            <input type="text" value="${name}" class="cat-name" placeholder="Category Name">
            <input type="text" value="${patterns.join(', ')}" class="cat-patterns" placeholder="patterns, separated, by, comma">
            <button class="remove-cat danger">×</button>
        `;
        div.querySelector('.remove-cat').addEventListener('click', () => {
            div.remove();
        });
        list.appendChild(div);
    });
}

document.getElementById('add-category').addEventListener('click', () => {
    const list = document.getElementById('category-list');
    const div = document.createElement('div');
    div.className = 'category-item';
    div.innerHTML = `
        <input type="text" value="" class="cat-name" placeholder="Category Name">
        <input type="text" value="" class="cat-patterns" placeholder="patterns, separated, by, comma">
        <button class="remove-cat danger">×</button>
    `;
    div.querySelector('.remove-cat').addEventListener('click', () => {
        div.remove();
    });
    list.appendChild(div);
});

document.getElementById('reset-categories').addEventListener('click', () => {
    if (confirm('Reset to default categories? This will overwrite your changes.')) {
        engine.saveCategories(null); // Passing null resets to default in engine
        renderCategoryEditor();
    }
});

document.getElementById('save-categories').addEventListener('click', () => {
    const newCategories = {};
    document.querySelectorAll('.category-item').forEach(item => {
        const name = item.querySelector('.cat-name').value;
        const patterns = item.querySelector('.cat-patterns').value.split(',').map(p => p.trim()).filter(p => p);
        if (name && patterns.length > 0) newCategories[name] = patterns;
    });
    engine.saveCategories(newCategories);
    alert('Categories saved locally!');
});

// CSV Download
document.getElementById('download-csv').addEventListener('click', () => {
    if (currentTransactions.length === 0) return;
    
    let csv = 'Date,Description,Points,Amount,DR/CR,Cardholder\n';
    currentTransactions.forEach(t => {
        const date = t.date.split('T')[0];
        const dr_cr = t.amount < 0 ? 'DR' : 'CR';
        const absAmount = Math.abs(t.amount);
        csv += `"${date}","${t.description.replace(/"/g, '""')}",${t.points},${absAmount},${dr_cr},"${t.cardholder}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hdfc_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
});

document.getElementById('clear-data').addEventListener('click', () => {
    if (confirm('Clear all session data? This will wipe transactions from memory.')) {
        window.location.reload();
    }
});

// Load Chart.js with SRI
(function() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.integrity = 'sha384-S3YY4o63Gv5fL7/XWw+fI8pJHMTd5T9mS8qC0F6yVvG1V+Z5vI5u6z9z7w2e4r5t'; // Placeholder, will fix SRI
    script.crossOrigin = 'anonymous';
    script.onload = () => console.log("Chart.js loaded safely.");
    document.head.appendChild(script);
})();

// Service Worker Registration for Offline Support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered:', reg))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}
