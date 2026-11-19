import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api/client';
import { currentMonthKey, monthKeyFromISODate, roundMoney, sumAmounts } from './utils/format';
import Navbar from './components/Navbar';
import DashboardSummary from './components/DashboardSummary';
import ExpenseForm from './components/ExpenseForm';
import BudgetForm from './components/BudgetForm';
import ExpenseFilters from './components/ExpenseFilters';
import ExpenseList from './components/ExpenseList';
import InsightsPanel from './components/InsightsPanel';

const EMPTY_FILTERS = { category: '', from: '', to: '' };

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [editingExpense, setEditingExpense] = useState(null);

  const refreshExpenses = useCallback(async () => {
    const data = await api.getExpenses();
    setExpenses(Array.isArray(data) ? data : []);
  }, []);

  const refreshBudget = useCallback(async () => {
    const data = await api.getBudget();
    setBudget(data && data.budget !== null && data.budget !== undefined ? Number(data.budget) : 0);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await Promise.all([refreshExpenses(), refreshBudget()]);
    } catch (error) {
      setLoadError(error.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [refreshExpenses, refreshBudget]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleExpenseSaved = useCallback(async () => {
    await refreshExpenses();
  }, [refreshExpenses]);

  const handleExpenseDeleted = useCallback(
    async (expense) => {
      await api.deleteExpense(expense.id);
      await refreshExpenses();
    },
    [refreshExpenses]
  );

  const handleBudgetSaved = useCallback(async () => {
    await refreshBudget();
  }, [refreshBudget]);

  const handleEdit = useCallback((expense) => {
    setEditingExpense(expense);
    document.getElementById('add-expense')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleEditCancelled = useCallback(() => {
    setEditingExpense(null);
  }, []);

  const monthKey = currentMonthKey();
  const monthExpenses = useMemo(
    () => expenses.filter((expense) => monthKeyFromISODate(expense.date) === monthKey),
    [expenses, monthKey]
  );
  const spent = useMemo(() => sumAmounts(monthExpenses), [monthExpenses]);
  const remaining = useMemo(() => roundMoney(budget - spent), [budget, spent]);

  const filteredExpenses = useMemo(() => {
    const { category, from, to } = filters;
    return expenses.filter((expense) => {
      if (category && expense.category !== category) return false;
      if (from && expense.date < from) return false;
      if (to && expense.date > to) return false;
      return true;
    });
  }, [expenses, filters]);

  return (
    <>
      <Navbar />
      <main>
        <section id="dashboard" aria-labelledby="dashboard-heading">
          <h2 id="dashboard-heading">Welcome to SpendSmart</h2>
          <p>
            Track your student spending, set a monthly budget, and get AI-powered
            insights on where your money goes each month.
          </p>
        </section>

        {loading && (
          <div className="app-status" role="status">
            <span className="spinner" aria-hidden="true" />
            Loading your expenses…
          </div>
        )}

        {!loading && loadError && (
          <div className="error-banner" role="alert">
            <p>{loadError}</p>
            <button type="button" className="secondary-button" onClick={loadAll}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            <DashboardSummary
              monthKey={monthKey}
              budget={budget}
              spent={spent}
              remaining={remaining}
            />

            <ExpenseForm
              key={editingExpense ? editingExpense.id : 'new'}
              editingExpense={editingExpense}
              onSaved={handleExpenseSaved}
              onCancelEdit={handleEditCancelled}
            />

            <BudgetForm budget={budget} monthKey={monthKey} spent={spent} onSaved={handleBudgetSaved} />

            <section id="history" aria-labelledby="history-heading">
              <h2 id="history-heading">Expense History</h2>
              <ExpenseFilters filters={filters} onChange={setFilters} />
              <ExpenseList
                expenses={filteredExpenses}
                totalCount={expenses.length}
                filtersActive={Boolean(filters.category || filters.from || filters.to)}
                onEdit={handleEdit}
                onDelete={handleExpenseDeleted}
              />
            </section>

            <InsightsPanel monthKey={monthKey} monthExpenses={monthExpenses} />
          </>
        )}
      </main>
      <footer>
        <p>&copy; 2026 SpendSmart — DSU AI-Powered Full Stack Development Course</p>
        <nav aria-label="Footer links">
          <ul>
            <li><a href="#dashboard">Back to top</a></li>
            <li><a href="#add-expense">Add Expense</a></li>
            <li><a href="#insights">Insights</a></li>
          </ul>
        </nav>
      </footer>
    </>
  );
}
