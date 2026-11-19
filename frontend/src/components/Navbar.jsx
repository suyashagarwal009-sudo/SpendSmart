export default function Navbar() {
  return (
    <header>
      <div className="logo">
        <span className="logo-mark" aria-hidden="true">S</span>
        <h1 className="logo-title">SpendSmart</h1>
      </div>
      <nav aria-label="Main navigation">
        <ul>
          <li><a href="#dashboard">Dashboard</a></li>
          <li><a href="#add-expense">Add Expense</a></li>
          <li><a href="#budget">Budget</a></li>
          <li><a href="#history">History</a></li>
          <li><a href="#insights">Insights</a></li>
        </ul>
      </nav>
    </header>
  );
}
