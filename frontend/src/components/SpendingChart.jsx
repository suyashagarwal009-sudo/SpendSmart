import { formatCurrency, roundMoney, sumAmounts } from '../utils/format';

/**
 * Category-wise spending bar chart for the current month. Pure CSS
 * bars keep the Phase 1/2 visual design and add no dependencies.
 */
export default function SpendingChart({ monthExpenses }) {
  const totals = new Map();
  monthExpenses.forEach((expense) => {
    totals.set(expense.category, roundMoney((totals.get(expense.category) ?? 0) + expense.amount));
  });

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = sumAmounts(entries.map(([, amount]) => ({ amount })));
  const largest = entries[0][1];

  return (
    <div className="category-breakdown" role="list" aria-label="Category-wise spending">
      {entries.map(([category, amount]) => {
        const share = Math.round((amount / total) * 100);
        return (
          <div
            key={category}
            className="category-row"
            role="listitem"
            aria-label={`${category}: ${formatCurrency(amount)}, ${share}% of spending`}
          >
            <span className="category-name">{category}</span>
            <div className="category-track">
              <div className="category-bar" style={{ width: `${Math.max(2, (amount / largest) * 100)}%` }} />
            </div>
            <span className="category-value">
              {formatCurrency(amount)}
              <span className="category-share"> · {share}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
