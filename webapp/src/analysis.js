/**
 * Analysis Engine
 * Ports the logic from analyze_spending.py to JavaScript.
 * Strictly follows the "No Persistence" rule for transaction data.
 */

export const DEFAULT_CATEGORIES = {
    "Travel": ["Indigo", "Air India", "Vistara", "Akasa", "MakeMyTrip", "Uber", "Ola", "IRCTC"],
    "Shopping": ["Myntra", "Ajio", "Zudio", "Lifestyle", "Shoppers Stop", "Nykaa"],
    "Amazon": ["Amazon", "AMZN"],
    "Food & Dining": ["Swiggy", "Zomato", "Starbucks", "Dominos", "Pizza Hut", "KFC"],
    "Healthcare": ["Apollo", "Pharmeasy", "Hospital", "Clinic", "Diagnostics"],
    "Fuel": ["HPCL", "BPCL", "IOCL", "Shell"],
    "Utilities": ["BESCOM", "Airtel", "Jio", "Vodafone", "Insurance", "TATA SKY"],
    "Groceries": ["Bigbasket", "Blinkit", "Zepto", "Instamart", "Reliance Retail", "DMart"]
};

export class AnalysisEngine {
    constructor() {
        this.categories = this.loadCategories();
    }

    loadCategories() {
        const saved = localStorage.getItem('vault_categories');
        return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
    }

    saveCategories(categories) {
        if (!categories) {
            this.categories = DEFAULT_CATEGORIES;
            localStorage.removeItem('vault_categories');
        } else {
            this.categories = categories;
            localStorage.setItem('vault_categories', JSON.stringify(categories));
        }
    }

    categorize(description) {
        const descUpper = description.toUpperCase();
        for (const [category, patterns] of Object.entries(this.categories)) {
            for (const pattern of patterns) {
                if (descUpper.includes(pattern.toUpperCase())) {
                    return category;
                }
            }
        }
        return "Uncategorized";
    }

    /**
     * Process a list of transactions and return summary & chart data.
     */
    process(transactions, cycleStartDay = 1) {
        const monthlyData = {};
        const monthlyTotals = {};
        let totalSpent = 0;
        let totalPoints = 0;

        transactions.forEach(t => {
            const amount = t.amount;
            const desc = t.description;
            const date = new Date(t.date);
            
            // Skip actual card payments
            const descUpper = desc.toUpperCase();
            if (descUpper.includes("CREDIT CARD PAYMENT") || descUpper.includes("NETBANKING TRANSFER")) {
                return;
            }

            const monthKey = this.getCycleKey(date, cycleStartDay);
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {};
                monthlyTotals[monthKey] = 0;
            }

            if (amount < 0) {
                // Spending
                const category = this.categorize(desc);
                const spend = Math.abs(amount);
                
                monthlyData[monthKey][category] = (monthlyData[monthKey][category] || 0) + spend;
                monthlyTotals[monthKey] += spend;
                totalSpent += spend;
                totalPoints += (t.points || 0);
            } else {
                // Credit/Refund
                monthlyTotals[monthKey] -= amount;
                totalSpent -= amount;
            }
        });

        return {
            summary: {
                totalSpent,
                totalPoints,
                totalCount: transactions.length
            },
            monthlyData,
            monthlyTotals,
            chartData: this.prepareChartData(monthlyData, monthlyTotals)
        };
    }

    getCycleKey(date, cycleStartDay) {
        if (cycleStartDay === 1) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        
        // Simplified billing cycle logic for JS
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        const day = date.getDate();

        if (day <= cycleStartDay) {
            // Belongs to previous cycle
            const prevDate = new Date(year, month - 1, 1);
            return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
            return `${year}-${String(month + 1).padStart(2, '0')}`;
        }
    }

    prepareChartData(monthlyData, monthlyTotals) {
        const sortedMonths = Object.keys(monthlyTotals).sort();
        const categories = [...Object.keys(this.categories), "Uncategorized"];
        
        return {
            months: sortedMonths,
            totals: sortedMonths.map(m => monthlyTotals[m]),
            categoryData: categories.map(cat => ({
                label: cat,
                data: sortedMonths.map(m => monthlyData[m][cat] || 0)
            }))
        };
    }
}
