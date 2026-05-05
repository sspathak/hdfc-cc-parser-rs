/**
 * WASM Parser Worker
 * Isolated thread for heavy-duty PDF parsing.
 * Sensitive data (PDF bytes) stay here and are never shared with the UI thread
 * except as processed JSON.
 */

import init, { parse_pdf_statement } from '../pkg/hdfc_cc_parser_rs.js';

let wasmInitialized = false;

self.onmessage = async (e) => {
    const { files, password, cardholderName } = e.data;

    try {
        if (!wasmInitialized) {
            await init();
            wasmInitialized = true;
        }

        let allTransactions = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            self.postMessage({ type: 'progress', current: i + 1, total: files.length, fileName: file.name });
            
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const transactions = parse_pdf_statement(uint8Array, password, cardholderName || "");
            allTransactions = allTransactions.concat(transactions);
        }

        self.postMessage({ type: 'done', transactions: allTransactions });
    } catch (err) {
        console.error("Worker Error:", err);
        self.postMessage({ type: 'error', message: err.toString() });
    }
};
