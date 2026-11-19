import { monthLabel } from '../utils/format';
import SpendingChart from './SpendingChart';

/**
 * Charts & insights section. Shows the category chart when the
 * current month has expenses, otherwise an explanatory empty state.
 * AI-generated narrative is planned for Phase 7.
 */
export default function InsightsPanel({ monthKey, monthExpenses }) {
  const label = monthLabel(monthKey);
  const hasData = monthExpenses.length > 0;

  return (
    <section id="insights" aria-labelledby="insights-heading">
      <h2 id="insights-heading">Spending Charts &amp; AI Insights</h2>
      {hasData ? (
        <>
          <p className="section-note">Where your money went in {label}, by category.</p>
          <SpendingChart monthExpenses={monthExpenses} />
        </>
      ) : (
        <p className="section-note">
          No expenses recorded for {label} yet. Add an expense to see the category split.
        </p>
      )}
    </section>
  );
}
