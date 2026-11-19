import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { MAX_AMOUNT } from '../constants';
import { formatCurrency, monthLabel, roundMoney } from '../utils/format';

/**
 * Controlled monthly-budget form. The budget applies to the current
 * calendar month, matching the API contract.
 */
export default function BudgetForm({ budget, monthKey, spent, onSaved }) {
  const [amount, setAmount] = useState(budget > 0 ? String(budget) : '');
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAmount(budget > 0 ? String(budget) : '');
  }, [budget]);

  const label = monthLabel(monthKey);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value < 1 || value > MAX_AMOUNT) {
      setMessage({ type: 'error', text: 'Enter a budget between ₹1 and ₹1,00,00,000.' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.setBudget(Math.round(value));
      setMessage({
        type: 'success',
        text: `Budget saved: ${formatCurrency(data.budget)} for ${label}.`,
      });
      await onSaved();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not save the budget.' });
    } finally {
      setSubmitting(false);
    }
  }

  const overBudget = budget > 0 && spent > budget;

  return (
    <section id="budget" aria-labelledby="budget-heading">
      <h2 id="budget-heading">Set Monthly Budget</h2>
      <p>
        Define how much you plan to spend this month. SpendSmart will calculate your
        remaining balance and flag when you are close to or over budget.
      </p>
      <p className="section-note">Budget month: {label}.</p>

      <form onSubmit={handleSubmit} aria-label="Set your monthly budget" noValidate>
        {message && (
          <div className={`form-message ${message.type}`} role="status" aria-live="polite">
            {message.text}
          </div>
        )}
        <div className="field">
          <label htmlFor="monthly-budget">Monthly Budget (₹)</label>
          <input
            type="number"
            id="monthly-budget"
            name="monthlyBudget"
            placeholder="e.g. 5000"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <button id="budget-submit" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Budget'}
        </button>
      </form>

      {budget > 0 && !overBudget && spent / budget >= 0.8 && (
        <p className="budget-warning warning" role="alert">
          Heads up — you have used {Math.round((spent / budget) * 100)}% of your budget.{' '}
          {formatCurrency(roundMoney(budget - spent))} left for {label}.
        </p>
      )}
      {overBudget && (
        <p className="budget-warning error" role="alert">
          Budget exceeded by {formatCurrency(roundMoney(spent - budget))}.
        </p>
      )}
    </section>
  );
}
