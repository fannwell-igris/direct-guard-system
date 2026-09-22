/**
 * DeploymentPage.tsx
 *
 * Deployment Records — shows guard assignments (roster entries) per site/client,
 * filterable by client, site, date range, and status. Exportable to PDF.
 *
 * Data source: GET /api/roster?clientId=&siteId=&dateFrom=&dateTo=&status=&page=&pageSize=
 * The roster entry has: employee, site, client, date, shiftType, status, notes.
 *
 * PDF generation uses the browser's built-in print dialog (window.print) with
 * a print-specific style that renders the table cleanly. No extra library needed.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Download, Search, ChevronLeft, ChevronRight,
  RefreshCw, X, ClipboardList,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

const API = "http://localhost:3000/api";

// ─── types ───────────────────────────────────────────────────────────────────

interface ShiftType {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  fullName: string;
  position?: string;
}

interface Site {
  id: string;
  siteName: string;
  location?: string;
}

interface Client {
  id: string;
  name: string;
}

interface RosterEntry {
  id: string;
  date: string;
  status: "SCHEDULED" | "CANCELLED";
  notes?: string | null;
  employee: Employee;
  site: Site;
  client: Client;
  shiftType: ShiftType;
}

interface PaginatedResponse {
  data: RosterEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ─── PDF export ──────────────────────────────────────────────────────────────

function printDeploymentReport(
  entries: RosterEntry[],
  filters: { clientName: string; siteName: string; dateFrom: string; dateTo: string; status: string }
) {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${fmt(e.date)}</td>
        <td>${e.employee.fullName}</td>
        <td>${e.employee.position ?? "—"}</td>
        <td>${e.site.siteName}</td>
        <td>${e.site.location ?? "—"}</td>
        <td>${e.client.name}</td>
        <td>${e.shiftType.name}</td>
        <td class="${e.status === "SCHEDULED" ? "status-scheduled" : "status-cancelled"}">${e.status}</td>
        <td>${e.notes ?? "—"}</td>
      </tr>`
    )
    .join("");

  const filterParts: string[] = [];
  if (filters.clientName) filterParts.push(`Client: ${filters.clientName}`);
  if (filters.siteName) filterParts.push(`Site: ${filters.siteName}`);
  if (filters.dateFrom) filterParts.push(`From: ${fmt(filters.dateFrom)}`);
  if (filters.dateTo) filterParts.push(`To: ${fmt(filters.dateTo)}`);
  if (filters.status) filterParts.push(`Status: ${filters.status}`);
  const filterLine = filterParts.length ? filterParts.join(" · ") : "All records";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Deployment Records — Magen Security</title>
  <style>
    @page { size: A4 landscape; margin: 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
    body { font-size: 11px; color: #111; }
    header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; border-bottom: 2px solid #003770; padding-bottom: 10px; }
    header .logo { font-size: 22px; font-weight: 700; color: #003770; letter-spacing: 1px; }
    header .meta { text-align: right; color: #444; font-size: 10px; }
    h1 { font-size: 16px; font-weight: 700; color: #003770; margin-bottom: 2px; }
    .filters { font-size: 10px; color: #555; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #003770; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f9fa; }
    .status-scheduled { color: #09aa4c; font-weight: 600; }
    .status-cancelled { color: #dc2626; font-weight: 600; }
    footer { margin-top: 16px; font-size: 9px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="logo">MAGEN</div>
      <div style="font-size:10px;color:#555;margin-top:2px;">Magen Security Management System</div>
    </div>
    <div class="meta">
      <div>Generated: ${new Date().toLocaleString("en-GB")}</div>
      <div>${entries.length} record${entries.length !== 1 ? "s" : ""}</div>
    </div>
  </header>
  <h1>Deployment Records</h1>
  <div class="filters">${filterLine}</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Guard Name</th>
        <th>Position</th>
        <th>Site</th>
        <th>Location</th>
        <th>Client</th>
        <th>Shift</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>Magen Security Management System · Confidential · Generated ${new Date().toLocaleDateString("en-GB")}</footer>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── component ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function DeploymentPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  // Filter state
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStartIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Data
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Dropdown lists
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  // For PDF filter labels
  const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
  const siteName = sites.find((s) => s.id === siteId)?.siteName ?? "";

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  // Load dropdown data
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/clients?pageSize=200`, { headers: headers() })
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
    fetch(`${API}/sites?pageSize=500`, { headers: headers() })
      .then((r) => r.json())
      .then((d) => setSites(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
  }, [token, headers]);

  // Filter sites by selected client
  const filteredSites = clientId
    ? sites.filter((s: any) => s.clientId === clientId)
    : sites;

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [clientId, siteId, dateFrom, dateTo, statusFilter]);

  // Fetch roster entries
  const fetchEntries = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (siteId) params.set("siteId", siteId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await fetch(`${API}/roster?${params}`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PaginatedResponse = await res.json();
      setEntries(Array.isArray(json.data) ? json.data : []);
      setTotal(json.total ?? 0);
    } catch (err) {
      showToast({ variant: "error", title: "Failed to load deployment records", message: String(err) });
    } finally {
      setLoading(false);
    }
  }, [token, clientId, siteId, dateFrom, dateTo, statusFilter, page, headers, showToast]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Client-side search across loaded page
  const displayed = search.trim()
    ? entries.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.employee.fullName.toLowerCase().includes(q) ||
          e.site.siteName.toLowerCase().includes(q) ||
          e.client.name.toLowerCase().includes(q) ||
          e.shiftType.name.toLowerCase().includes(q)
        );
      })
    : entries;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Export: fetch ALL matching records (up to 1000) then print
  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (siteId) params.set("siteId", siteId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", "1");
      params.set("pageSize", "1000");

      const res = await fetch(`${API}/roster?${params}`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PaginatedResponse = await res.json();
      const all = Array.isArray(json.data) ? json.data : [];
      if (all.length === 0) {
        showToast({ variant: "warning", title: "No records to export", message: "Adjust your filters and try again." });
        return;
      }
      printDeploymentReport(all, { clientName, siteName, dateFrom, dateTo, status: statusFilter });
    } catch (err) {
      showToast({ variant: "error", title: "Export failed", message: String(err) });
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setClientId("");
    setSiteId("");
    setDateFrom(monthStartIso());
    setDateTo(todayIso());
    setStatusFilter("");
    setSearch("");
    setPage(1);
  }

  const hasFilters = !!(clientId || siteId || statusFilter || search);

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList size={22} className="text-magen-green" />
            Deployment Records
          </h1>
          <p className="page-subtitle">
            Guard assignment records by site and client — filterable by date range
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEntries}
            disabled={loading}
            className="btn-secondary"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="btn-primary"
          >
            <Download size={15} />
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Filters card */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Client filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setSiteId(""); }}
              className="select"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Site filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Site</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="select"
            >
              <option value="">All sites</option>
              {filteredSites.map((s) => (
                <option key={s.id} value={s.id}>{s.siteName}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Search + clear row */}
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search guard, site, client, shift…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-8"
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary text-xs py-1.5">
              <X size={13} /> Clear filters
            </button>
          )}
          <span className="text-xs text-gray-500 ml-auto">
            {loading ? "Loading…" : `${total} record${total !== 1 ? "s" : ""} total`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Guard</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400 text-sm">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Loading deployment records…
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400 text-sm">
                    <FileText size={28} className="mx-auto mb-2 opacity-30" />
                    No deployment records found for the selected filters.
                  </td>
                </tr>
              ) : (
                displayed.map((entry) => (
                  <tr key={entry.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">
                      {fmt(entry.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {entry.employee.fullName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {entry.employee.position ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {entry.site.siteName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {entry.site.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {entry.client.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {entry.shiftType.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          entry.status === "SCHEDULED"
                            ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                            : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                        }
                      >
                        {entry.status === "SCHEDULED" ? "Scheduled" : "Cancelled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {entry.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page} of {totalPages} · {total} records
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-2 py-1 text-xs"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-magen-green text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-2 py-1 text-xs"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
