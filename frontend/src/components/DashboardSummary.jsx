import { formatCurrency, monthLabel } from '../utils/format';

/**
 * Monthly summary cards (budget / spending / remaining) plus the
 * budget warning banner. All values are derived by the parent from
 * API data; this component only presents them.
 */
export default function DashboardSummary({ monthKey, budget, spent, remaining }) {
  const label = monthLabel(monthKey);
  const overBudget = budget > 0 && spent > budget;
  const nearBudget = budget > 0 && !overBudget && spent / budget >= 0.8;

  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading">Monthly Summary</h2>
      <p className="section-note">Showing {label}. Amounts are in Indian Rupees (₹).</p>
      <div className="summary-cards">
        <article className="card" aria-labelledby="budget-card-heading">
          <h3 id="budget-card-heading">Monthly Budget</h3>
          <p
            className="card-amount"
            aria-label={
              budget > 0
                ? `Monthly budget for ${label}: ${formatCurrency(budget)}`
                : `No monthly budget set for ${label}`
            }
          >
            {formatCurrency(budget)}
          </p>
        </article>

        <article className="card" aria-labelledby="spending-card-heading">
          <h3 id="spending-card-heading">Total Spending</h3>
          <p
            className="card-amount"
            aria-label={`Total spending for ${label}: ${formatCurrency(spent)}`}
          >
            {formatCurrency(spent)}
          </p>
        </article>

        <article className="card" aria-labelledby="remaining-card-heading">
          <h3 id="remaining-card-heading">Remaining Balance</h3>
          <p
            className={`card-amount${overBudget ? ' is-negative' : ''}`}
            aria-label={
              budget > 0
                ? `Remaining balance for ${label}: ${formatCurrency(remaining)}`
                : 'Set a monthly budget to see your remaining balance'
            }
          >
            {budget > 0 ? formatCurrency(remaining) : '—'}
          </p>
        </article>
      </div>

      {budget <= 0 && (
        <p className="budget-warning note" role="alert">
          Set a budget for {label} to track how much you have left.
        </p>
      )}
      {overBudget && (
        <p className="budget-warning error" role="alert">
          Budget exceeded by {formatCurrency(roundMoneySafe(spent - budget))}. You have
          spent {formatCurrency(spent)} of your {formatCurrency(budget)} budget.
        </p>
      )}
      {nearBudget && (
        <p className="budget-warning warning" role="alert">
          Heads up — you have used {Math.round((spent / budget) * 100)}% of your budget.{' '}
          {formatCurrency(roundMoneySafe(budget - spent))} left for {label}.
        </p>
      )}
    </section>
  );
}

function roundMoneySafe(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
