# HDFC Statement Analyzer & Export Utility

A professional-grade, privacy-first tool for parsing HDFC Credit Card PDF statements. This utility allows you to extract transactions, categorize spending, and export data to CSV entirely within your browser.

## Key Features

- **Privacy-First**: Your financial data never leaves your device. Decryption and parsing are performed locally using a Rust engine compiled to WebAssembly (WASM).
- **Multi-Cardholder Support**: Automatically detects and separates transactions for different cardholders on the same account.
- **Spending Dashboard**: Visualizes your spending trends with stacked bar charts and category breakdowns.
- **Quick Export**: One-click generation of clean CSV files compatible with Excel, Google Sheets, and Tally.
- **Custom Categorization**: Define your own rules to automatically categorize transactions based on description keywords.

## How it Works

1. **Local Decryption**: The PDF is decrypted in your browser memory using the password you provide.
2. **Rust/WASM Parsing**: A high-performance Rust engine extracts transaction details (Date, Description, Amount, Cardholder).
3. **Zero-Networking**: The application is governed by a strict Content Security Policy (CSP) that blocks all external network requests.
4. **Volatile Memory**: Data is stored only in volatile RAM and is automatically wiped when the browser tab is closed.

## Technical Transparency

This project is entirely open-source and designed to be auditable. 
- **Parsing Engine**: Written in Rust for safety and performance.
- **Frontend**: Clean, dependency-light JavaScript and CSS.
- **Deployment**: Hosted on GitHub Pages via automated Actions.

## Credits & Attribution

This project is a web-based implementation and enhancement of the HDFC Credit Card Parser.

- **Forked From**: [joeirimpan/hdfc-cc-parser-rs](https://github.com/joeirimpan/hdfc-cc-parser-rs)
- **Original Author**: Special thanks to **Joe Paul** for the core parsing logic and the original Rust implementation.

## Security Audit

The source code is available for public audit at: [https://github.com/sspathak/hdfc-cc-parser-rs](https://github.com/sspathak/hdfc-cc-parser-rs)

---
Copyright Suraj Pathak &copy; 2026
