import { useState } from 'react';
import * as api from '../api/client';
import { CATEGORIES, PAYMENT_METHODS, MAX_AMOUNT, MAX_TITLE_LENGTH, MIN_TITLE_LENGTH } from '../constants';
import { isValidISODate, todayISO } from '../utils/format';

const EMPTY_FORM = {
  title: '',
  amount: '',
  category: '',
  date: todayISO(),
  paymentMethod: '',
};

function validate(input) {
  const errors = {};
  const title = input.title.trim();
  if (title.length < MIN_TITLE_LENGTH) errors.title = `Title must be at least ${MIN_TITLE_LENGTH} characters.`;
  else if (title.length > MAX_TITLE_LENGTH) errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters.`;

  const amount = Number(input.amount);
  if (!input.amount || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Amount must be greater than zero.';
  else if (amount > MAX_AMOUNT) errors.amount = `Amount may not exceed ${MAX_AMOUNT}.`;
  else if (Math.round(amount * 100) !== Number((amount * 100).toFixed(0))) errors.amount = 'Amount may have at most 2 decimal places.';

  if (!CATEGORIES.includes(input.category)) errors.category = 'Please select a category.';
  if (!isValidISODate(input.date)) errors.date = 'Please choose a valid date.';
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) errors.paymentMethod = 'Please choose a payment method.';

  return errors;
}

/**
 * Controlled add/edit expense form. When `editingExpense` is set the
 * form loads that expense, submits via PUT, and offers a cancel action.
 */
export default function ExpenseForm({ editingExpense, onSaved, onCancelEdit }) {
  const [form, setForm] = useState(
    editingExpense
      ? {
          title: editingExpense.title,
          amount: String(editingExpense.amount),
          category: editingExpense.category,
          date: editingExpense.date,
          paymentMethod: editingExpense.paymentMethod,
        }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null); // { type, text }
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(editingExpense);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleChange(event) {
    const { name, value } = event.target;
    updateField(name, value);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setMessage({ type: 'error', text: Object.values(nextErrors)[0] });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        amount: Number(form.amount),
        category: form.category,
        date: form.date,
        paymentMethod: form.paymentMethod,
      };
      if (isEditing) {
        await api.updateExpense(editingExpense.id, payload);
        setMessage({ type: 'success', text: 'Expense updated.' });
      } else {
        await api.createExpense(payload);
        setMessage({ type: 'success', text: 'Expense added.' });
        setForm({ ...EMPTY_FORM, date: todayISO() });
      }
      setErrors({});
      await onSaved();
    } catch (error) {
      if (error.fields) setErrors({ ...error.fields });
      setMessage({ type: 'error', text: error.message || 'Could not save the expense.' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isEditing) {
      onCancelEdit();
    }
  }

  return (
    <section id="add-expense" aria-labelledby="add-expense-heading">
      <h2 id="add-expense-heading">{isEditing ? 'Edit Expense' : 'Add Expense'}</h2>

      <form
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        aria-label={isEditing ? 'Edit expense' : 'Add a new expense'}
        noValidate
      >
        {message && (
          <div className={`form-message ${message.type}`} role="status" aria-live="polite">
            {message.text}
          </div>
        )}

        <div className="field">
          <label htmlFor="expense-title">Expense Title</label>
          <input
            type="text"
            id="expense-title"
            name="title"
            placeholder="e.g. Bus ticket to campus"
            value={form.title}
            onChange={handleChange}
            required
            minLength={MIN_TITLE_LENGTH}
            maxLength={MAX_TITLE_LENGTH}
            aria-invalid={errors.title ? 'true' : undefined}
            aria-describedby={errors.title ? 'expense-title-error' : undefined}
          />
          {errors.title && (
            <span className="field-error" id="expense-title-error">{errors.title}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="expense-amount">Amount (₹)</label>
          <input
            type="number"
            id="expense-amount"
            name="amount"
            placeholder="e.g. 150"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={handleChange}
            required
            aria-invalid={errors.amount ? 'true' : undefined}
            aria-describedby={errors.amount ? 'expense-amount-error' : undefined}
          />
          {errors.amount && (
            <span className="field-error" id="expense-amount-error">{errors.amount}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="expense-category">Category</label>
          <select
            id="expense-category"
            name="category"
            value={form.category}
            onChange={handleChange}
            required
            aria-invalid={errors.category ? 'true' : undefined}
          >
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {errors.category && <span className="field-error">{errors.category}</span>}
        </div>

        <div className="field">
          <label htmlFor="expense-date">Date</label>
          <input
            type="date"
            id="expense-date"
            name="date"
            value={form.date}
            onChange={handleChange}
            required
            aria-invalid={errors.date ? 'true' : undefined}
          />
          {errors.date && <span className="field-error">{errors.date}</span>}
        </div>

        <div className="field">
          <fieldset aria-describedby="payment-hint">
            <legend>Payment Method</legend>
            <span id="payment-hint" className="visually-hidden">
              Choose how you paid for this expense.
            </span>
            {PAYMENT_METHODS.map((method) => (
              <label key={method} htmlFor={`pay-${method.toLowerCase()}`}>
                <input
                  type="radio"
                  id={`pay-${method.toLowerCase()}`}
                  name="paymentMethod"
                  value={method}
                  checked={form.paymentMethod === method}
                  onChange={handleChange}
                  required
                />
                {method}
              </label>
            ))}
          </fieldset>
          {errors.paymentMethod && <span className="field-error">{errors.paymentMethod}</span>}
        </div>

        <button id="expense-submit" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Expense'}
        </button>
        {isEditing && (
          <button className="secondary-button" type="button" onClick={onCancelEdit}>
            Cancel Edit
          </button>
        )}
      </form>
    </section>
  );
}
