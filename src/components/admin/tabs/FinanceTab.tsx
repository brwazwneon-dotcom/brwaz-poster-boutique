import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EXPENSE_CATEGORIES,
  listExpensesAdmin,
  upsertExpenseAdmin,
  deleteExpenseAdmin,
  getProfitReportAdmin,
  type DashboardRange,
} from "@/lib/db-admin.functions";

type Expense = {
  id: string;
  amount: number;
  category: string;
  expense_date: string;
  description: string | null;
  payment_method: string | null;
};

type ProfitReport = Awaited<ReturnType<typeof getProfitReportAdmin>>;

const RANGE_OPTIONS: { id: DashboardRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FinanceTab() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [editing, setEditing] = useState<Partial<Expense> | null>(null);
  const [range, setRange] = useState<DashboardRange>("this_month");
  const [report, setReport] = useState<ProfitReport | null>(null);

  const loadExpenses = async () => setExpenses((await listExpensesAdmin({ data: { days: 90 } })) as Expense[]);
  const loadReport = async () => setReport(await getProfitReportAdmin({ data: { range } }));

  useEffect(() => {
    loadExpenses();
  }, []);
  useEffect(() => {
    setReport(null);
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const save = async () => {
    if (!editing?.amount || editing.amount <= 0) return toast.error("Amount is required");
    if (!editing?.category) return toast.error("Category is required");
    try {
      await upsertExpenseAdmin({
        data: {
          id: editing.id,
          amount: editing.amount,
          category: editing.category,
          expense_date: editing.expense_date ?? todayISO(),
          description: editing.description ?? null,
          payment_method: editing.payment_method ?? null,
        },
      });
      toast.success("Saved");
      setEditing(null);
      loadExpenses();
      loadReport();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    await deleteExpenseAdmin({ data: id });
    loadExpenses();
    loadReport();
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Finance</h2>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Profit</h3>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-sm border px-3 py-1.5 text-xs ${
                range === r.id ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {report === null ? (
        <p className="mb-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-sm border border-border p-4">
              <div className="text-lg font-semibold">{report.revenue.toLocaleString()} EGP</div>
              <div className="text-xs text-muted-foreground">Revenue ({report.orders} orders)</div>
            </div>
            <div className="rounded-sm border border-border p-4">
              <div className="text-lg font-semibold">{report.totalExpenses.toLocaleString()} EGP</div>
              <div className="text-xs text-muted-foreground">Logged expenses</div>
            </div>
            <div className="rounded-sm border border-border p-4">
              <div className={`text-lg font-semibold ${report.netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {report.netProfit.toLocaleString()} EGP
              </div>
              <div className="text-xs text-muted-foreground">Net profit (revenue − expenses)</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Doesn't yet subtract per-order print/frame/packaging cost — that needs real cost figures
            from you first. Log expenses below and this number gets more accurate over time.
          </p>
          {(report.expensesByCategory as { category: string; total: string }[]).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(report.expensesByCategory as { category: string; total: string }[]).map((e) => (
                <span key={e.category} className="rounded-sm border border-border px-2 py-1 text-xs capitalize">
                  {e.category}: {Number(e.total).toLocaleString()} EGP
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Expenses</h3>
        <button
          onClick={() => setEditing({ amount: 0, category: "other", expense_date: todayISO() })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New expense
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-3 rounded-sm border border-border bg-card p-4 sm:grid-cols-2">
          <input
            type="number"
            min={0}
            placeholder="Amount (EGP)"
            value={editing.amount ?? ""}
            onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={editing.category ?? "other"}
            onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm capitalize"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={editing.expense_date ?? todayISO()}
            onChange={(e) => setEditing({ ...editing, expense_date: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Payment method (optional)"
            dir="ltr"
            value={editing.payment_method ?? ""}
            onChange={(e) => setEditing({ ...editing, payment_method: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Description (optional)"
            dir="ltr"
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {expenses === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-xs">{new Date(e.expense_date).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-xs capitalize">{e.category}</td>
                  <td className="px-3 py-2 font-medium">{Number(e.amount).toLocaleString()} EGP</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.description || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(e)} className="mr-3 text-xs text-cyan-500 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(e.id)} className="text-xs text-red-500 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
