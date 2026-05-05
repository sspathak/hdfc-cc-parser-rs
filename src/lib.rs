use anyhow::{Context, Error};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use pdf::content::*;
use pdf::file::File as PdfFile;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Transaction row representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub date: NaiveDateTime,
    pub description: String,
    pub points: i32,
    pub amount: f32,
    pub cardholder: String,
}

impl Default for Transaction {
    fn default() -> Self {
        Transaction {
            date: NaiveDateTime::new(
                NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
                NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
            ),
            description: String::new(),
            points: 0,
            amount: 0.0,
            cardholder: String::new(),
        }
    }
}

// ============================================================================
// Date/Amount/Points Parsing Helpers
// ============================================================================

const DATE_FORMATS: &[&str] = &[
    "%d/%m/%Y| %H:%M",
    "%d/%m/%Y | %H:%M",
    "%d/%m/%Y %H:%M:%S",
];

fn parse_transaction_date(s: &str) -> Option<NaiveDateTime> {
    for format in DATE_FORMATS {
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, format) {
            return Some(dt);
        }
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%m/%Y") {
        return Some(NaiveDateTime::new(d, NaiveTime::from_hms_opt(0, 0, 0).unwrap()));
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d-%b-%Y") {
        return Some(NaiveDateTime::new(d, NaiveTime::from_hms_opt(0, 0, 0).unwrap()));
    }
    None
}

fn parse_amount(s: &str, is_credit: bool) -> Option<f32> {
    let clean = s.replace('₹', "").replace('\u{20b9}', "").replace(',', "").trim().to_string();
    let (is_credit, num_str) = if clean.starts_with('+') {
        (true, clean.trim_start_matches('+').trim())
    } else {
        (is_credit, clean.as_str())
    };
    num_str.parse::<f32>().ok().map(|amt| if is_credit { amt } else { -amt })
}

fn parse_points(s: &str) -> Option<i32> {
    s.replace("+ ", "+").replace("- ", "-").trim().parse::<i32>().ok()
}

// ============================================================================
// Text Classification Helpers
// ============================================================================

const SECTION_TERMINATORS: &[&str] = &[
    "Eligible for EMI", "Eligible for", "TRANSACTIONS", "Past Dues", "GST Summary",
    "Rewards Program Points Summary", "Offers on your card", "TOTAL AMOUNT", "CONVERT TO EMI",
];

const FOREIGN_CURRENCY_PREFIXES: &[&str] = &["USD ", "JPY ", "MYR ", "EUR ", "GBP ", "SGD ", "AUD ", "THB "];

fn is_section_terminator(text: &str) -> bool {
    SECTION_TERMINATORS.contains(&text) || text.starts_with("*Transaction time")
}

fn is_page_header(text: &str) -> bool {
    text == "Infinia Credit Card Statement" || text.starts_with("HSN Code:") || text.starts_with("HDFC Bank Credit Cards GSTIN:") || text.contains("GSTIN: 33AAACH")
}

fn is_page_number(text: &str) -> bool {
    text.starts_with("Page ") && text.contains(" of ")
}

fn is_foreign_currency(text: &str) -> bool {
    FOREIGN_CURRENCY_PREFIXES.iter().any(|prefix| text.starts_with(prefix))
}

fn is_skippable_symbol(text: &str) -> bool {
    matches!(text, "+" | "C" | "₹" | "l" | "●" | "•" | "Cr" | "CR" | "Dr" | "DR")
}

// ============================================================================
// Parser State Machine
// ============================================================================

struct ParserState {
    in_transactions: bool,
    past_header: bool,
    name_matched: bool,
    current_cardholder: String,
    skip_next_non_date: bool,
    in_row: bool,
    has_amount: bool,
    is_credit: bool,
    transaction: Transaction,
    desc_parts: Vec<String>,
}

impl ParserState {
    fn new() -> Self {
        ParserState {
            in_transactions: false,
            past_header: false,
            name_matched: false,
            current_cardholder: String::new(),
            skip_next_non_date: false,
            in_row: false,
            has_amount: false,
            is_credit: false,
            transaction: Transaction::default(),
            desc_parts: Vec::new(),
        }
    }

    fn flush_transaction(&mut self, transactions: &mut Vec<Transaction>) {
        if self.in_row && !self.transaction.description.is_empty() {
            if !self.desc_parts.is_empty() {
                self.transaction.description = self.desc_parts.join(" ");
            }
            self.transaction.cardholder = self.current_cardholder.clone();
            transactions.push(self.transaction.clone());
        }
    }

    fn start_new_transaction(&mut self, date: NaiveDateTime) {
        self.transaction = Transaction::default();
        self.transaction.date = date;
        self.transaction.cardholder = self.current_cardholder.clone();
        self.in_row = true;
        self.has_amount = false;
        self.is_credit = false;
        self.desc_parts.clear();
    }

    fn exit_section(&mut self) {
        self.in_transactions = false;
        self.past_header = false;
        self.name_matched = false;
        self.current_cardholder = String::new();
        self.transaction = Transaction::default();
        self.in_row = false;
        self.has_amount = false;
        self.desc_parts.clear();
    }
}

fn extract_page_texts(ops: &[Op]) -> Vec<String> {
    ops.iter()
        .filter_map(|op| {
            if let Op::TextDraw { ref text } = op {
                std::str::from_utf8(text.as_bytes()).ok().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect()
}

// ============================================================================
// WASM Interface
// ============================================================================

#[wasm_bindgen]
pub fn parse_pdf_statement(data: &[u8], password: &str, cardholder_name: &str) -> Result<JsValue, JsValue> {
    let transactions = parse_internal(data, password, cardholder_name)
        .map_err(|e| JsValue::from_str(&format!("Parsing error: {}", e)))?;
    
    serde_wasm_bindgen::to_value(&transactions)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

fn parse_internal(data: &[u8], password: &str, cardholder_name: &str) -> Result<Vec<Transaction>, Error> {
    let file = PdfFile::from_data_password(data, password.as_bytes())
        .context("Failed to open PDF data with password")?;

    let mut all_transactions = Vec::new();
    let name_regex = Regex::new(r"Card Holder Name\s*[:\-]\s*(.*)").unwrap();

    for page in file.pages() {
        let page = match page {
            Ok(p) => p,
            Err(_) => continue,
        };

        let content = match &page.contents {
            Some(c) => c,
            None => continue,
        };

        let ops = match content.operations(&file) {
            Ok(o) => o,
            Err(_) => continue,
        };

        let texts = extract_page_texts(&ops);
        let mut state = ParserState::new();

        for text in texts {
            // Start of transaction section
            if text == "Domestic Transactions" || text == "International Transactions" || text.starts_with("Transaction Details") {
                state.in_transactions = true;
                state.past_header = false;
                if let Some(caps) = name_regex.captures(&text) {
                    let name = caps.get(1).unwrap().as_str().trim().to_string();
                    state.current_cardholder = name.clone();
                    state.name_matched = cardholder_name.is_empty() || name.contains(cardholder_name);
                } else {
                    state.name_matched = cardholder_name.is_empty();
                }
                continue;
            }

            if !state.in_transactions {
                continue;
            }

            if !state.past_header {
                if let Some(caps) = name_regex.captures(&text) {
                    let name = caps.get(1).unwrap().as_str().trim().to_string();
                    state.current_cardholder = name.clone();
                    state.name_matched = cardholder_name.is_empty() || name.contains(cardholder_name);
                } else if !cardholder_name.is_empty() && text.contains(cardholder_name) {
                    state.name_matched = true;
                    if state.current_cardholder.is_empty() {
                        state.current_cardholder = text.clone();
                    }
                }

                if text == cardholder_name || text == "PI" || text == "Card Number" {
                    if state.name_matched || text == "PI" {
                        state.past_header = true;
                        state.skip_next_non_date = true;
                    } else if text == "Card Number" {
                        state.in_transactions = false;
                    }
                }
                continue;
            }

            if state.skip_next_non_date {
                state.skip_next_non_date = false;
                if parse_transaction_date(&text).is_none() {
                    continue;
                }
            }

            if is_section_terminator(&text) {
                state.flush_transaction(&mut all_transactions);
                state.exit_section();
                continue;
            }

            if let Some(dt) = parse_transaction_date(&text) {
                state.flush_transaction(&mut all_transactions);
                state.start_new_transaction(dt);
                continue;
            }

            if !state.in_row {
                continue;
            }

            if is_skippable_symbol(&text) {
                if text == "+" || text.eq_ignore_ascii_case("cr") {
                    state.transaction.amount = -state.transaction.amount.abs();
                }
                continue;
            }

            if is_page_number(&text) || is_page_header(&text) {
                continue;
            }

            if is_foreign_currency(&text) {
                state.desc_parts.push(text.clone());
                continue;
            }

            if text.contains('.') {
                if let Some(mut amt) = parse_amount(&text, false) {
                    // Check if description already contains CR (sometimes it's in the same block)
                    if state.desc_parts.iter().any(|p| p.to_uppercase().contains("CR")) {
                        amt = -amt.abs();
                    } else {
                        amt = amt.abs(); // Spending is positive
                    }
                    state.transaction.amount = amt;
                    state.has_amount = true;
                    continue;
                }
            }

            if state.has_amount {
                continue;
            }

            if let Some(p) = parse_points(&text) {
                state.transaction.points = p;
                continue;
            }

            state.desc_parts.push(text.clone());
            if state.transaction.description.is_empty() {
                state.transaction.description = text.clone();
            }
        }
        state.flush_transaction(&mut all_transactions);
    }

    Ok(all_transactions)
}
