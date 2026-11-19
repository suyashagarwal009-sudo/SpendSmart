import { formatCurrency, sortByNewest, sumAmounts } from '../utils/format';

/**
 * Expense history table with empty states and a filter summary.
 * Edit/Delete bubble up to the parent, which owns the API calls.
 */
export default function ExpenseList({ expenses, totalCount, filtersActive, onEdit, onDelete }) {
  const visible = sortByNewest(expenses);
  const hasAnyExpenses = totalCount > 0;

  async function handleDelete(expense) {
    if (!window.confirm(`Delete “${expense.title}”? This cannot be undone.`)) return;
    await onDelete(expense);
  }

  return (
    <>
      {filtersActive && (
        <p className="filter-summary" role="status" aria-live="polite">
          Showing {visible.length} of {totalCount} expenses, totalling{' '}
          {formatCurrency(sumAmounts(visible))}.
        </p>
      )}

      <div className="table-scroll">
        <table>
          <caption>
            {filtersActive ? 'Filtered expenses, newest first.' : 'All saved expenses, newest first.'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Category</th>
              <th scope="col">Date</th>
              <th scope="col">Payment</th>
              <th scope="col">Amount</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!hasAnyExpenses && (
              <tr className="empty-row">
                <td colSpan={6}>No expenses yet. Add your first expense using the form above.</td>
              </tr>
            )}
            {hasAnyExpenses && visible.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}>No expenses match the current filters.</td>
              </tr>
            )}
            {visible.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.title}</td>
                <td>{expense.category}</td>
                <td>
                  <time dateTime={expense.date}>{expense.date}</time>
                </td>
                <td>{expense.paymentMethod}</td>
                <td>{formatCurrency(expense.amount)}</td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="action-button"
                      aria-label={`Edit ${expense.title}`}
                      onClick={() => onEdit(expense)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action-button delete-button"
                      aria-label={`Delete ${expense.title}`}
                      onClick={() => handleDelete(expense)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
