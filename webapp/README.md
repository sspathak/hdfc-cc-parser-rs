# VaultHDFC - Private Statement Analyzer

A "Vault-Grade" privacy-preserving web application to analyze HDFC Credit Card statements.

## Security Features
- **Zero-Network**: Enforced by `connect-src 'none'` Content Security Policy.
- **In-Browser Parsing**: Rust-based WASM engine runs entirely on your device.
- **Zero-Persistence**: Transactions are never saved to disk; wiped on refresh.
- **Offline-First**: Works without an internet connection once loaded.

## How to Run Locally

1. **Prerequisites**:
   - Node.js & npm
   - Rust (with `wasm32-unknown-unknown` target)
   - `wasm-pack`

2. **Build the WASM Engine**:
   ```bash
   # From the root directory
   ./wasm-pack build --target web --out-dir webapp/pkg
   ```

3. **Run the Webapp**:
   ```bash
   cd webapp
   npm install
   npm run dev
   ```

4. **Production Build**:
   ```bash
   cd webapp
   npm run build
   ```

## Development
- `src/lib.rs`: The Rust core exposed via `wasm-bindgen`.
- `webapp/src/worker.js`: The Web Worker managing the WASM lifecycle.
- `webapp/src/analysis.js`: The JS port of the category and summary logic.
- `webapp/src/main.js`: UI logic and state management.

## Privacy Audit
The application is designed to be structurally incapable of data exfiltration. You can verify this by opening the Network tab in your browser's Developer Tools; no requests will be made except for the initial load of assets.
