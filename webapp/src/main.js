import { AnalysisEngine } from './analysis.js';
import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/+esm';
Chart.register(...registerables);

// DOM Elements
const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('nav button');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const passwordInput = document.getElementById('password-input');
const processBtn = document.getElementById('process-btn');
const quickExportBtn = document.getElementById('quick-export-btn');
const resultsArea = document.getElementById('results-area');
const statusContainer = document.getElementById('status-container');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');

// Security Modal
const securityTrigger = document.getElementById('security-info-trigger');
const securityModal = document.getElementById('security-modal');
const closeModal = document.getElementById('close-modal');

securityTrigger?.addEventListener('click', () => securityModal.classList.remove('hidden'));
closeModal?.addEventListener('click', () => securityModal.classList.add('hidden'));

// State
let selectedFiles = [];
const engine = new AnalysisEngine();
let worker = null;
let currentTransactions = [];
let pendingAction = 'analyze'; // 'analyze' or 'export'

// Initialize Worker
function initWorker() {
    if (worker) worker.terminate();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
        const { type, transactions, message, current, total, fileName } = e.data;
        
        if (type === 'progress') {
            const percent = (current / total) * 100;
            progressFill.style.width = `${percent}%`;
            statusText.textContent = `Parsing ${fileName}...`;
        } else if (type === 'done') {
            statusContainer.classList.add('hidden');
            currentTransactions = transactions;
            if (pendingAction === 'export') {
                downloadCSV();
                processBtn.disabled = false;
                quickExportBtn.disabled = false;
            } else {
                displayResults(transactions);
            }
        } else if (type === 'error') {
            statusContainer.classList.add('hidden');
            alert(`Error: ${message}`);
            processBtn.disabled = false;
            quickExportBtn.disabled = false;
        }
    };
}

// Navigation
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = `view-${btn.id.split('-')[1]}`;
        views.forEach(v => v.classList.add('hidden'));
        const targetEl = document.getElementById(targetView);
        if (targetEl) targetEl.classList.remove('hidden');
        
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
        fileList.innerHTML = selectedFiles.map(f => `
            <div class="file-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                ${f.name}
            </div>
        `).join('');
        fileList.classList.remove('hidden');
        document.querySelector('.upload-prompt').classList.add('hidden');
        checkReady();
    }
}

passwordInput.addEventListener('input', checkReady);

function checkReady() {
    const ready = (selectedFiles.length > 0 && passwordInput.value.length > 0);
    processBtn.disabled = !ready;
    quickExportBtn.disabled = !ready;
}

// Processing
processBtn.addEventListener('click', () => {
    pendingAction = 'analyze';
    startProcessing();
});

quickExportBtn.addEventListener('click', () => {
    pendingAction = 'export';
    startProcessing();
});

function startProcessing() {
    if (!worker) initWorker();
    
    processBtn.disabled = true;
    quickExportBtn.disabled = true;
    resultsArea.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    
    worker.postMessage({
        files: selectedFiles,
        password: passwordInput.value
    });
}

function displayResults(transactions) {
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
    if (trendChart) trendChart.destroy();
    if (categoryChart) categoryChart.destroy();

    const trendCtx = document.getElementById('trend-chart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: chartData.months,
            datasets: [{
                label: 'Spending',
                data: chartData.totals,
                backgroundColor: '#2563eb',
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }
            },
            scales: { 
                y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            }
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
                    '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', 
                    '#bfdbfe', '#dbeafe', '#f1f5f9', '#cbd5e1', '#94a3b8'
                ],
                borderWidth: 1,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
        }
    });
}

// Category Editor
function renderCategoryEditor() {
    const list = document.getElementById('category-list');
    list.innerHTML = '';
    
    Object.entries(engine.categories).forEach(([name, patterns]) => {
        const div = document.createElement('div');
        div.className = 'cat-row';
        div.innerHTML = `
            <input type="text" value="${name}" class="cat-name-in" placeholder="Category">
            <input type="text" value="${patterns.join(', ')}" class="cat-patt-in" placeholder="Keywords...">
            <button class="remove-cat-btn">×</button>
        `;
        div.querySelector('.remove-cat-btn').addEventListener('click', () => div.remove());
        list.appendChild(div);
    });
}

document.getElementById('add-category').addEventListener('click', () => {
    const list = document.getElementById('category-list');
    const div = document.createElement('div');
    div.className = 'cat-row';
    div.innerHTML = `
        <input type="text" value="" class="cat-name-in" placeholder="Category">
        <input type="text" value="" class="cat-patt-in" placeholder="Keywords...">
        <button class="remove-cat-btn">×</button>
    `;
    div.querySelector('.remove-cat-btn').addEventListener('click', () => div.remove());
    list.appendChild(div);
});

document.getElementById('reset-categories').addEventListener('click', () => {
    if (confirm('Reset to default rules?')) {
        engine.saveCategories(null);
        renderCategoryEditor();
    }
});

document.getElementById('save-categories').addEventListener('click', () => {
    const newCategories = {};
    document.querySelectorAll('.cat-row').forEach(item => {
        const name = item.querySelector('.cat-name-in').value;
        const patterns = item.querySelector('.cat-patt-in').value.split(',').map(p => p.trim()).filter(p => p);
        if (name && patterns.length > 0) newCategories[name] = patterns;
    });
    engine.saveCategories(newCategories);
    alert('Settings saved.');
});

// CSV Download
document.getElementById('download-csv').addEventListener('click', downloadCSV);

function downloadCSV() {
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
    a.download = `hdfc_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

document.getElementById('clear-data').addEventListener('click', () => {
    if (confirm('Clear session and wipe data?')) window.location.reload();
});

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.log('SW failed:', err));
    });
}
