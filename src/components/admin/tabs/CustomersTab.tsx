import { useEffect, useMemo, useState } from "react";
import { listCustomersAdmin } from "@/lib/db-admin.functions";

type AdminCustomer = {
  phone: string;
  customer_name: string;
  governorate: string;
  order_count: number;
  total_spent: number;
  last_order_at: string;
};

export function CustomersTab() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => setCustomers((await listCustomersAdmin()) as AdminCustomer[]))();
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (c) => c.phone.includes(needle) || c.customer_name.toLowerCase().includes(needle),
    );
  }, [customers, q]);

  if (customers === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Customers</h2>
        <input
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded-sm border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Governorate</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Total spent</th>
                <th className="px-3 py-2">Last order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{c.customer_name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                  <td className="px-3 py-2 text-xs">{c.governorate}</td>
                  <td className="px-3 py-2">{c.order_count}</td>
                  <td className="px-3 py-2 font-medium">{Number(c.total_spent)} EGP</td>
                  <td className="px-3 py-2 text-xs">{new Date(c.last_order_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
