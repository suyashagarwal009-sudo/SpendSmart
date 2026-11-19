import { CATEGORIES } from '../constants';

/**
 * Controlled filter controls for the expense history. The parent owns
 * the filter state; every change flows up through onChange.
 */
export default function ExpenseFilters({ filters, onChange }) {
  function update(name, value) {
    onChange({ ...filters, [name]: value });
  }

  return (
    <div className="filters" role="group" aria-label="Filter expenses">
      <div className="field">
        <label htmlFor="filter-category">Filter by category</label>
        <select
          id="filter-category"
          value={filters.category}
          onChange={(event) => update('category', event.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="filter-from">From date</label>
        <input
          type="date"
          id="filter-from"
          value={filters.from}
          onChange={(event) => update('from', event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="filter-to">To date</label>
        <input
          type="date"
          id="filter-to"
          value={filters.to}
          onChange={(event) => update('to', event.target.value)}
        />
      </div>
      <button
        className="secondary-button"
        type="button"
        onClick={() => onChange({ category: '', from: '', to: '' })}
      >
        Clear Filters
      </button>
    </div>
  );
}
