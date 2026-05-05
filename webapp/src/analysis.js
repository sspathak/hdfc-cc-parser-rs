export const DEFAULT_CATEGORIES = {
    "Dining": ["SWIGGY", "ZOMATO", "EATS", "RESTAURANT", "FOOD", "CAFE", "BAKERY", "PIZZA"],
    "Groceries": ["BLINKIT", "BIGBASKET", "ZEPTO", "GROCERY", "SUPERMARKET", "RETAIL"],
    "Shopping": ["AMAZON", "FLIPKART", "MYNTRA", "AJIO", "SHOPPING", "NYKAA"],
    "Travel": ["UBER", "OLA", "IRCTC", "INDIGO", "AIRLINES", "MAKEMYTRIP", "MTRIP", "CLEARTRIP", "HOTEL"],
    "Utilities": ["BESCOM", "AIRTEL", "JIO", "VODAFONE", "ACT", "BROADBAND", "ELECTRICITY", "WATER"],
    "Health": ["PHARMEASY", "APOLLO", "HOSPITAL", "CLINIC", "MEDICAL"],
    "Entertainment": ["BOOKMYSHOW", "NETFLIX", "PRIME VIDEO", "DISNEY", "CINEMA"],
    "Fuel": ["HPCL", "BPCL", "IOCL", "SHELL", "FUEL", "PETROL"],
    "Other": []
};

export class AnalysisEngine {
    constructor() {
        this.categories = DEFAULT_CATEGORIES;
    }

    saveCategories(categories) {
        if (!categories) {
            this.categories = DEFAULT_CATEGORIES;
        } else {
            this.categories = categories;
        }
    }

    exportCategories() {
        const data = JSON.stringify(this.categories, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hdfc_categorization_rules_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async importCategories(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            
            // Basic validation and sanitization
            const clean = {};
            for (const [cat, patterns] of Object.entries(imported)) {
                if (typeof cat === 'string' && Array.isArray(patterns)) {
                    // Sanitize category name (alphanumeric and spaces)
                    const cleanCat = cat.replace(/[^\w\s]/gi, '').substring(0, 50);
                    // Sanitize patterns (alphanumeric and spaces)
                    const cleanPatterns = patterns
                        .filter(p => typeof p === 'string')
                        .map(p => p.replace(/[^\w\s]/gi, '').substring(0, 100))
                        .filter(p => p.length > 0);
                    
                    if (cleanCat && cleanPatterns.length > 0) {
                        clean[cleanCat] = cleanPatterns;
                    }
                }
            }
            
            if (Object.keys(clean).length > 0) {
                this.categories = clean;
                return true;
            }
            return false;
        } catch (e) {
            console.error("Import error:", e);
            return false;
        }
    }

    categorize(description) {
        const desc = description.toUpperCase();
        for (const [category, patterns] of Object.entries(this.categories)) {
            if (patterns.some(p => desc.includes(p.toUpperCase()))) {
                return category;
            }
        }
        return "Other";
    }

    process(transactions, cardholderFilters = null) {
        let filtered = transactions;
        if (cardholderFilters !== null) {
            filtered = transactions.filter(t => cardholderFilters.includes(t.cardholder));
        }

        const summary = {
            totalSpent: 0,
            totalRefunds: 0,
            totalCount: filtered.length
        };

        const monthlyData = {}; // { "Jan 2024": { "Dining": 100, "Shopping": 200, ... } }
        const categoriesTotal = {};

        filtered.forEach(t => {
            const date = new Date(t.date);
            const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            
            if (!monthlyData[monthKey]) monthlyData[monthKey] = {};

            const amount = t.amount;
            if (amount > 0) {
                // Spending (Debit)
                summary.totalSpent += amount;
                const cat = this.categorize(t.description);
                
                monthlyData[monthKey][cat] = (monthlyData[monthKey][cat] || 0) + amount;
                categoriesTotal[cat] = (categoriesTotal[cat] || 0) + amount;
            } else {
                // Refund / Payment (Credit)
                summary.totalRefunds += Math.abs(amount);
            }
        });

        // Prepare chart data
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(a) - new Date(b));
        const allCategories = Object.keys(this.categories);

        const stackedDatasets = allCategories.map(cat => ({
            label: cat,
            data: sortedMonths.map(month => monthlyData[month][cat] || 0)
        }));

        const categoryData = allCategories.map(cat => ({
            label: cat,
            value: categoriesTotal[cat] || 0
        })).filter(c => c.value > 0);

        return {
            summary,
            chartData: {
                months: sortedMonths,
                stackedDatasets,
                categoryData
            },
            allCardholders: [...new Set(transactions.map(t => t.cardholder))]
        };
    }
}
