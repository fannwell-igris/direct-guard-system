import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";

interface Employee { id: string; fullName: string; }
interface Department { id: string; name: string; }
interface Site { id: string; siteName: string; }

interface InventoryItem {
  id: string; name: string; category: string;
  itemType: "ASSET" | "CONSUMABLE"; quantity: number;
  unitOfMeasure: string | null; condition: string;
  serialNumber: string | null; canTakeHome: boolean;
  takenHome: boolean; status: string;
  assignedToEmployeeId: string | null;
  assignedToEmployee?: { fullName: string } | null;
  assignedToDepartmentId: string | null;
  assignedToDepartment?: { name: string } | null;
  assignedToSiteId: string | null;
  assignedToSite?: { siteName: string } | null;
  purchaseDate: string | null; purchasePrice: string | null; notes: string | null;
  // Asset-return workflow fields
  returnStatus?: "PENDING_COLLECTION" | "COLLECTED" | null;
  returnTriggeredAt?: string | null;
  returnConfirmedAt?: string | null;
  returnConfirmedBy?: string | null;
}

interface StockMovement {
  id: string; movementType: string; quantity: number; movementDate: string;
  reference: string | null; recordedBy: string | null;
  issuedToEmployee?: { fullName: string } | null;
}

interface TakeHomeLog {
  id: string; action: string; actionDate: string; authorisedBy: string | null;
  employee?: { fullName: string } | null;
}

// ---- Tab classification ----
// company  = chairs, desks, furniture — record only, no assignment
// personal = laptops, phones, vehicles — assigned to person, take-home tracked
// consumable = stationery, fuel — qty based
// uniform  = boots, jackets, caps
// equipment = batons, tasers, radios

const COMPANY_PROPERTY_CATS = ["chair", "desk", "table", "cabinet", "air condition", "fridge", "microwave", "printer", "photocopier", "television", "tv", "furniture"];
const PERSONAL_ASSET_CATS = ["laptop", "computer", "phone", "mobile", "vehicle", "car", "truck", "motorbike", "tablet", "camera"];
const UNIFORM_CATS = ["uniform", "boot", "jacket", "cap", "shirt", "vest", "glove", "trouser", "tie"];
const EQUIPMENT_CATS = ["equipment", "baton", "taser", "radio", "torch", "handcuff", "pepper", "shield", "belt"];

type TabKey = "company" | "personal" | "consumable" | "uniform" | "equipment";

function getItemTab(item: Pick<InventoryItem, "category" | "itemType">): TabKey {
  if (item.itemType === "CONSUMABLE") return "consumable";
  const cat = item.category.toLowerCase();
  if (UNIFORM_CATS.some((u) => cat.includes(u))) return "uniform";
  if (EQUIPMENT_CATS.some((e) => cat.includes(e))) return "equipment";
  if (PERSONAL_ASSET_CATS.some((p) => cat.includes(p))) return "personal";
  if (COMPANY_PROPERTY_CATS.some((c) => cat.includes(c))) return "company";
  return "company"; // default assets to company property
}

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: "company", label: "Company Property", description: "Chairs, desks, furniture — record keeping only" },
  { key: "personal", label: "Personal Assets", description: "Laptops, phones, vehicles — assigned to individuals" },
  { key: "consumable", label: "Consumables", description: "Stationery, fuel — tracked by quantity" },
  { key: "uniform", label: "Uniforms", description: "Boots, jackets, caps — issued to officers" },
  { key: "equipment", label: "Equipment", description: "Batons, tasers, radios — issued to officers" },
];

const CATEGORY_SUGGESTIONS: Record<TabKey, string[]> = {
  company: ["Chairs", "Desks", "Tables", "Filing Cabinets", "Air Conditioners", "Printers", "Televisions", "Fridges"],
  personal: ["Laptops", "Mobile Phones", "Vehicles", "Tablets", "Cameras", "Computers"],
  consumable: ["Stationery", "Fuel", "Office Supplies", "Cleaning Supplies", "First Aid Supplies"],
  uniform: ["Uniforms", "Boots", "Jackets", "Caps", "Shirts", "Vests", "Trousers"],
  equipment: ["Batons", "Tasers", "Radios", "Torches", "Handcuffs", "Pepper Spray", "Shields"],
};

const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "CONDEMNED"];
const MOVEMENT_TYPES = ["PURCHASE", "ISSUE", "WRITE_OFF", "ADJUSTMENT"];

interface ItemFormState {
  name: string; category: string; itemType: string; quantity: string;
  unitOfMeasure: string; condition: string; serialNumber: string;
  canTakeHome: boolean; assignedToEmployeeId: string;
  assignedToDepartmentId: string; assignedToSiteId: string;
  purchaseDate: string; purchasePrice: string; notes: string;
}

const EMPTY_FORM: ItemFormState = {
  name: "", category: "", itemType: "ASSET", quantity: "1",
  unitOfMeasure: "", condition: "GOOD", serialNumber: "",
  canTakeHome: false, assignedToEmployeeId: "",
  assignedToDepartmentId: "", assignedToSiteId: "",
  purchaseDate: "", purchasePrice: "", notes: "",
};

function conditionBadge(c: string) {
  const map: Record<string, string> = {
    NEW: "bg-green-100 text-green-700", GOOD: "bg-green-100 text-green-700",
    FAIR: "bg-yellow-100 text-yellow-700", POOR: "bg-orange-100 text-orange-700",
    CONDEMNED: "bg-red-100 text-red-700",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[c] ?? "bg-gray-100 text-gray-600"}`}>{c}</span>;
}

function ReconciliationBar({ items }: { items: InventoryItem[] }) {
  const total = items.reduce((sum, i) => sum + i.quantity, 0);
  const issued = items.filter((i) => i.assignedToEmployeeId).length;
  const inStock = total - issued;
  const disc = inStock < 0;
  return (
    <div className={`flex gap-8 px-5 py-3 rounded-lg mb-3 ${disc ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"}`}>
      {([["Total", total, "text-gray-900"], ["Issued to Officers", issued, "text-green-600"], ["In Stock", Math.max(0, inStock), disc ? "text-red-600" : "text-green-600"]] as const).map(([label, val, cls]) => (
        <div key={label} className="text-center">
          <p className={`text-2xl font-bold ${cls}`}>{val}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      ))}
      {disc && <div className="flex items-center text-xs text-red-600 font-medium ml-4">⚠ Discrepancy — more issued than total stock</div>}
    </div>
  );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const userRole = user?.role ?? "STAFF";
  // canManage: can create items, edit item details, archive
  const canManage = ["ADMIN", "MANAGER"].includes(userRole);
  // canIssue: can log stock movements (OPERATIONS limited to ISSUE only — enforced server-side too)
  const canIssue  = ["ADMIN", "MANAGER", "OPERATIONS"].includes(userRole);
  // availableMovementTypes: OPERATIONS can only ISSUE; ADMIN/MANAGER get all types
  const availableMovementTypes = canManage ? MOVEMENT_TYPES : ["ISSUE"];

  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [takeLogs, setTakeLogs] = useState<TakeHomeLog[]>([]);
  const [detailTab, setDetailTab] = useState<"movements" | "takehome">("movements");
  const [showMovForm, setShowMovForm] = useState(false);
  const [movType, setMovType] = useState("PURCHASE");
  const [movQty, setMovQty] = useState("");
  const [movDate, setMovDate] = useState(new Date().toISOString().slice(0, 10));
  const [movEmp, setMovEmp] = useState("");
  const [movRef, setMovRef] = useState("");
  const [movBy, setMovBy] = useState("");
  const [movErr, setMovErr] = useState<string | null>(null);
  const [savingMov, setSavingMov] = useState(false);
  const [showThForm, setShowThForm] = useState(false);
  const [thBy, setThBy] = useState("");
  const [thNotes, setThNotes] = useState("");
  const [thErr, setThErr] = useState<string | null>(null);
  const [savingTh, setSavingTh] = useState(false);
  // Confirm collection (pending-return assets)
  const [showCollectForm, setShowCollectForm] = useState(false);
  const [collectBy, setCollectBy] = useState("");
  const [collectErr, setCollectErr] = useState<string | null>(null);
  const [savingCollect, setSavingCollect] = useState(false);

  async function loadItems() {
    setIsLoading(true);
    try {
      const res = await api.get("/inventory", { params: { pageSize: 100 } });
      setAllItems(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load inventory."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadItems();
    Promise.all([
      api.get("/employees", { params: { pageSize: 100 } }),
      api.get("/departments", { params: { pageSize: 100 } }),
      api.get("/sites", { params: { pageSize: 100 } }),
    ]).then(([e, d, s]) => { setEmployees(e.data.data); setDepartments(d.data.data); setSites(s.data.data); }).catch(() => {});
  }, []);

  async function submitCollectConfirm() {
    if (!selectedItem || !collectBy.trim()) { setCollectErr("Please enter who collected the item."); return; }
    setSavingCollect(true); setCollectErr(null);
    try {
      await api.post(`/inventory/${selectedItem.id}/confirm-collection`, { confirmedBy: collectBy.trim() });
      setShowCollectForm(false); setCollectBy("");
      await loadItems();
      // Re-open detail with fresh data
      const res = await api.get(`/inventory/${selectedItem.id}`);
      setSelectedItem(res.data.data);
    } catch (err: any) { setCollectErr(err.response?.data?.message ?? "Failed to confirm collection."); }
    finally { setSavingCollect(false); }
  }

  async function openDetail(item: InventoryItem) {
    setSelectedItem(item); setDetailTab("movements"); setShowMovForm(false); setShowThForm(false); setShowCollectForm(false);
    try {
      const [mr, lr] = await Promise.all([api.get(`/inventory/${item.id}/movements`), api.get(`/inventory/${item.id}/take-home-log`)]);
      setMovements(mr.data.data); setTakeLogs(lr.data.data);
    } catch {}
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const isCompany = getItemTab({ category: form.category, itemType: form.itemType as InventoryItem["itemType"] }) === "company";
    const payload: Record<string, unknown> = {
      name: form.name.trim(), category: form.category.trim(), itemType: form.itemType,
      condition: form.condition, canTakeHome: isCompany ? false : form.canTakeHome,
      unitOfMeasure: form.unitOfMeasure.trim() || null, serialNumber: form.serialNumber.trim() || null,
      purchaseDate: form.purchaseDate || null, purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
      assignedToEmployeeId: isCompany ? null : form.assignedToEmployeeId || null,
      assignedToDepartmentId: form.assignedToDepartmentId || null,
      assignedToSiteId: form.assignedToSiteId || null,
      notes: form.notes.trim() || null,
    };
    if (editingId === "new") payload.quantity = parseInt(form.quantity) || 0;
    try {
      if (editingId === "new") await api.post("/inventory", payload);
      else if (editingId) await api.put(`/inventory/${editingId}`, payload);
      setEditingId(null); await loadItems();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save."); }
    finally { setIsSaving(false); }
  }

  async function submitMovement(e: FormEvent) {
    e.preventDefault(); setMovErr(null); setSavingMov(true);
    try {
      await api.post(`/inventory/${selectedItem!.id}/movements`, {
        movementType: movType, quantity: parseInt(movQty), movementDate: movDate,
        issuedToEmployeeId: movEmp || null, reference: movRef.trim() || null, recordedBy: movBy.trim() || null,
      });
      setShowMovForm(false); setMovQty(""); setMovRef(""); setMovBy(""); setMovEmp("");
      const r = await api.get(`/inventory/${selectedItem!.id}/movements`); setMovements(r.data.data);
      await loadItems();
    } catch (err: any) { setMovErr(err.response?.data?.message ?? "Failed."); }
    finally { setSavingMov(false); }
  }

  async function submitTakeHome(action: "take-home" | "return") {
    setThErr(null); setSavingTh(true);
    try {
      await api.post(`/inventory/${selectedItem!.id}/${action}`, { authorisedBy: thBy.trim() || null, notes: thNotes.trim() || null });
      setShowThForm(false); setThBy(""); setThNotes("");
      const [ir, lr] = await Promise.all([api.get(`/inventory/${selectedItem!.id}`), api.get(`/inventory/${selectedItem!.id}/take-home-log`)]);
      setSelectedItem(ir.data.data); setTakeLogs(lr.data.data); await loadItems();
    } catch (err: any) { setThErr(err.response?.data?.message ?? "Failed."); }
    finally { setSavingTh(false); }
  }

  const tabItems = allItems.filter((i) => getItemTab(i) === activeTab);
  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const isCompanyTab = activeTab === "company";
  const isAssignableTab = activeTab === "personal" || activeTab === "uniform" || activeTab === "equipment";
  const suggestions = CATEGORY_SUGGESTIONS[activeTab];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventory & Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{allItems.length} total items across all categories</p>
        </div>
        {canManage && (
          <button onClick={() => {
            setForm({ ...EMPTY_FORM, itemType: activeTab === "consumable" ? "CONSUMABLE" : "ASSET" });
            setFormError(null); setEditingId("new"); setSelectedItem(null);
          }} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
            + Add Item
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => {
          const cnt = allItems.filter((i) => getItemTab(i) === t.key).length;
          return (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setEditingId(null); setSelectedItem(null); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.key ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
              {t.label} {cnt > 0 && <span className="ml-1 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <p className="text-xs text-gray-400">{currentTab.description}</p>

      {/* Reconciliation bar for uniform/equipment */}
      {(activeTab === "uniform" || activeTab === "equipment") && tabItems.length > 0 && <ReconciliationBar items={tabItems} />}

      {/* Add/edit form */}
      {editingId && (
        <Modal
          title={editingId === "new" ? `Add ${currentTab.label} Item` : "Edit Item"}
          onClose={() => setEditingId(null)}
          widthClass="max-w-2xl"
        >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Category *</label>
              <input required list="cat-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <datalist id="cat-list">{suggestions.map((s) => <option key={s} value={s} />)}</datalist></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Condition</label>
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            {editingId === "new" && <div><label className="text-xs font-medium text-gray-700 block mb-1">Quantity</label>
              <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>}
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Unit of Measure</label>
              <input value={form.unitOfMeasure} placeholder="pieces, units…" onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          </div>
          {!isCompanyTab && (
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Serial Number</label>
              <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          )}
          {/* Assignment — company property: site/dept only. Others: employee too */}
          <div className={`grid gap-4 ${isCompanyTab ? "grid-cols-2" : "grid-cols-3"}`}>
            {!isCompanyTab && (
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Assign to Employee</label>
                <select value={form.assignedToEmployeeId} onChange={(e) => setForm({ ...form, assignedToEmployeeId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">None</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select></div>
            )}
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Assign to Department</label>
              <select value={form.assignedToDepartmentId} onChange={(e) => setForm({ ...form, assignedToDepartmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Assign to Site</label>
              <select value={form.assignedToSiteId} onChange={(e) => setForm({ ...form, assignedToSiteId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">None</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Purchase Price (K)</label>
              <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          </div>
          {activeTab === "personal" && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="cth" checked={form.canTakeHome} onChange={(e) => setForm({ ...form, canTakeHome: e.target.checked })} className="rounded" />
              <label htmlFor="cth" className="text-xs text-gray-700">Can be taken home</label>
            </div>
          )}
          <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
            <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSaving} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">{isSaving ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => setEditingId(null)} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
          </div>
        </form>
        </Modal>
      )}

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? <div className="p-6 text-sm text-gray-400">Loading...</div>
            : tabItems.length === 0 ? <div className="p-6 text-sm text-gray-400">No {currentTab.label.toLowerCase()} items yet.</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-right px-4 py-3">Qty</th>
                    <th className="text-left px-4 py-3">Condition</th>
                    {!isCompanyTab && <th className="text-left px-4 py-3">Assigned To</th>}
                    {isCompanyTab && <th className="text-left px-4 py-3">Location</th>}
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tabItems.map((item) => (
                    <tr key={item.id} className={selectedItem?.id === item.id ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(item)} className="font-medium text-green-600 hover:underline text-left">
                          {item.name}{item.takenHome && <span className="ml-1 text-xs text-orange-500">📤</span>}
                          {item.returnStatus === "PENDING_COLLECTION" && (
                            <span className="ml-1.5 inline-block bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">⚠ Pending Collection</span>
                          )}
                        </button>
                        {item.serialNumber && <p className="text-xs text-gray-400">S/N: {item.serialNumber}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.category}</td>
                      <td className="px-4 py-3 text-right font-medium">{item.quantity}{item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}</td>
                      <td className="px-4 py-3">{conditionBadge(item.condition)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {isCompanyTab
                          ? (item.assignedToSite?.siteName ?? item.assignedToDepartment?.name ?? "—")
                          : (item.assignedToEmployee?.fullName ?? item.assignedToDepartment?.name ?? item.assignedToSite?.siteName ?? "—")}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {canManage && (
                          <button onClick={() => {
                            setForm({ name: item.name, category: item.category, itemType: item.itemType, quantity: String(item.quantity), unitOfMeasure: item.unitOfMeasure ?? "", condition: item.condition, serialNumber: item.serialNumber ?? "", canTakeHome: item.canTakeHome, assignedToEmployeeId: item.assignedToEmployeeId ?? "", assignedToDepartmentId: item.assignedToDepartmentId ?? "", assignedToSiteId: item.assignedToSiteId ?? "", purchaseDate: item.purchaseDate?.slice(0, 10) ?? "", purchasePrice: item.purchasePrice ?? "", notes: item.notes ?? "" });
                            setFormError(null); setEditingId(item.id); setSelectedItem(null);
                          }} className="text-green-600 hover:underline text-xs">Edit</button>
                        )}
                        <button onClick={() => openDetail(item)} className="text-gray-500 hover:underline text-xs">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div className="w-72 shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3 self-start">
            <div className="flex items-start justify-between">
              <div><h3 className="text-sm font-semibold text-gray-900">{selectedItem.name}</h3>
                <p className="text-xs text-gray-400">{selectedItem.category}</p></div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            <div className="text-xs space-y-1 text-gray-500">
              <div className="flex justify-between"><span>Qty</span><span className="font-medium text-gray-900">{selectedItem.quantity}{selectedItem.unitOfMeasure ? ` ${selectedItem.unitOfMeasure}` : ""}</span></div>
              <div className="flex justify-between"><span>Condition</span>{conditionBadge(selectedItem.condition)}</div>
              {selectedItem.serialNumber && <div className="flex justify-between"><span>S/N</span><span className="text-gray-700">{selectedItem.serialNumber}</span></div>}
              {selectedItem.assignedToEmployee && <div className="flex justify-between"><span>Assigned to</span><span className="text-gray-700">{selectedItem.assignedToEmployee.fullName}</span></div>}
              {selectedItem.assignedToDepartment && <div className="flex justify-between"><span>Department</span><span className="text-gray-700">{selectedItem.assignedToDepartment.name}</span></div>}
              {selectedItem.assignedToSite && <div className="flex justify-between"><span>Site</span><span className="text-gray-700">{selectedItem.assignedToSite.siteName}</span></div>}
              {selectedItem.canTakeHome && <div className="flex justify-between"><span>Take-home</span><span className={selectedItem.takenHome ? "text-orange-600 font-medium" : "text-green-600"}>{selectedItem.takenHome ? "Currently away" : "In office"}</span></div>}
            </div>

            {/* Pending-collection banner + confirm action */}
            {selectedItem.returnStatus === "PENDING_COLLECTION" && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-700">⚠ Awaiting Physical Collection</p>
                <p className="text-xs text-red-600">
                  This item was flagged when the assigned officer was terminated or marked absconded.
                  Confirm below once it has been physically retrieved.
                </p>
                {selectedItem.returnTriggeredAt && (
                  <p className="text-xs text-red-500">Flagged: {new Date(selectedItem.returnTriggeredAt).toLocaleDateString("en-GB")}</p>
                )}
                {canManage && (
                  !showCollectForm ? (
                    <button onClick={() => setShowCollectForm(true)} className="w-full text-xs bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700">
                      Confirm Collected
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      {collectErr && <p className="text-xs text-red-700">{collectErr}</p>}
                      <input
                        placeholder="Collected by (your name)"
                        value={collectBy}
                        onChange={(e) => setCollectBy(e.target.value)}
                        className="w-full border border-red-300 rounded px-2 py-1.5 text-xs"
                      />
                      <div className="flex gap-2">
                        <button onClick={submitCollectConfirm} disabled={savingCollect}
                          className="flex-1 text-xs bg-red-600 text-white rounded px-2 py-1.5 hover:bg-red-700 disabled:opacity-60">
                          {savingCollect ? "Saving…" : "Confirm"}
                        </button>
                        <button onClick={() => { setShowCollectForm(false); setCollectBy(""); setCollectErr(null); }}
                          className="text-xs border border-gray-300 rounded px-2 py-1.5 hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {selectedItem.returnStatus === "COLLECTED" && selectedItem.returnConfirmedAt && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-700">
                ✓ Collected on {new Date(selectedItem.returnConfirmedAt).toLocaleDateString("en-GB")}
                {selectedItem.returnConfirmedBy && ` by ${selectedItem.returnConfirmedBy}`}
              </div>
            )}

            {/* Stock movements — show for all tabs */}
            <div className="border-t pt-3">
              {isAssignableTab && (
                <div className="flex border-b border-gray-100 mb-2 -mx-4 px-4">
                  {(["movements", "takehome"] as const).map((t) => (
                    <button key={t} onClick={() => setDetailTab(t)}
                      className={`text-xs px-3 py-1.5 ${detailTab === t ? "border-b-2 border-green-600 text-green-600 font-medium" : "text-gray-400"}`}>
                      {t === "movements" ? "Movements" : "Take-Home"}
                    </button>
                  ))}
                </div>
              )}

              {(!isAssignableTab || detailTab === "movements") && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">Stock Movements</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {movements.length === 0 ? <p className="text-xs text-gray-400">No movements yet.</p> : movements.map((m) => (
                      <div key={m.id} className="text-xs border-b border-gray-100 pb-1.5">
                        <div className="flex justify-between">
                          <span className={`font-medium ${
                            ["PURCHASE", "ADJUSTMENT", "RETURN_CONFIRMED"].includes(m.movementType)
                              ? "text-green-600"
                              : m.movementType === "RETURN_PENDING"
                                ? "text-orange-600"
                                : "text-red-600"
                          }`}>
                            {m.movementType === "RETURN_PENDING" ? "⚠ " : m.movementType === "RETURN_CONFIRMED" ? "✓ " : ["PURCHASE", "ADJUSTMENT"].includes(m.movementType) ? "+" : "-"}
                            {m.quantity} {m.movementType.replace(/_/g, " ")}
                          </span>
                          <span className="text-gray-400">{new Date(m.movementDate).toLocaleDateString("en-GB")}</span>
                        </div>
                        {m.issuedToEmployee && <p className="text-gray-400">→ {m.issuedToEmployee.fullName}</p>}
                        {m.reference && <p className="text-gray-400">Ref: {m.reference}</p>}
                      </div>
                    ))}
                  </div>
                  {canIssue && (!showMovForm ? (
                    <button onClick={() => setShowMovForm(true)} className="w-full text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50">+ Record Movement</button>
                  ) : (
                    <form onSubmit={submitMovement} className="space-y-2 border-t pt-2">
                      {movErr && <p className="text-xs text-red-600">{movErr}</p>}
                      <select value={movType} onChange={(e) => setMovType(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs">
                        {availableMovementTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" required min="1" placeholder="Qty" value={movQty} onChange={(e) => setMovQty(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs" />
                        <input type="date" required value={movDate} onChange={(e) => setMovDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs" />
                      </div>
                      {movType === "ISSUE" && (
                        <select value={movEmp} onChange={(e) => setMovEmp(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs">
                          <option value="">Issue to employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                        </select>
                      )}
                      <input placeholder="Reference" value={movRef} onChange={(e) => setMovRef(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                      <input placeholder="Recorded by" value={movBy} onChange={(e) => setMovBy(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingMov} className="flex-1 text-xs bg-green-600 text-white rounded px-2 py-1.5 hover:bg-green-700 disabled:opacity-60">{savingMov ? "..." : "Save"}</button>
                        <button type="button" onClick={() => setShowMovForm(false)} className="text-xs border border-gray-300 rounded px-2 py-1.5 hover:bg-gray-50">Cancel</button>
                      </div>
                    </form>
                  ))}
                </div>
              )}

              {isAssignableTab && detailTab === "takehome" && (
                <div className="space-y-2">
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {takeLogs.length === 0 ? <p className="text-xs text-gray-400">No take-home history.</p> : takeLogs.map((log) => (
                      <div key={log.id} className="text-xs border-b border-gray-100 pb-1.5">
                        <div className="flex justify-between">
                          <span className={`font-medium ${log.action === "TAKEN_HOME" ? "text-orange-500" : "text-green-600"}`}>
                            {log.action === "TAKEN_HOME" ? "📤 Taken home" : "📥 Returned"}
                          </span>
                          <span className="text-gray-400">{new Date(log.actionDate).toLocaleDateString("en-GB")}</span>
                        </div>
                        {log.employee && <p className="text-gray-400">{log.employee.fullName}</p>}
                        {log.authorisedBy && <p className="text-gray-400">Auth: {log.authorisedBy}</p>}
                      </div>
                    ))}
                  </div>
                  {thErr && <p className="text-xs text-red-600">{thErr}</p>}
                  {canManage && selectedItem.canTakeHome && selectedItem.assignedToEmployeeId && (
                    !showThForm ? (
                      <button onClick={() => setShowThForm(true)} className="w-full text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50">
                        {selectedItem.takenHome ? "Record Return" : "Record Take-Home"}
                      </button>
                    ) : (
                      <div className="space-y-2 border-t pt-2">
                        <input placeholder="Authorised by" value={thBy} onChange={(e) => setThBy(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                        <input placeholder="Notes" value={thNotes} onChange={(e) => setThNotes(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                        <div className="flex gap-2">
                          <button onClick={() => submitTakeHome(selectedItem.takenHome ? "return" : "take-home")} disabled={savingTh}
                            className="flex-1 text-xs bg-orange-500 text-white rounded px-2 py-1.5 hover:bg-orange-600 disabled:opacity-60">
                            {savingTh ? "..." : selectedItem.takenHome ? "Confirm Return" : "Confirm"}
                          </button>
                          <button onClick={() => setShowThForm(false)} className="text-xs border border-gray-300 rounded px-2 py-1.5 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

