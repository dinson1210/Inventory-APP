import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, FileUp, Plus, Pencil, Trash2, Save, X, RotateCcw, Search } from "lucide-react";
import * as XLSX from "xlsx";

/**
 * Inventory Desktop App — V3.8 (embedded for Electron build)
 * This is the same app UI you saw in Canvas, adapted to our lightweight UI stubs.
 */

const LS_KEY = "inventory_app_v1";
const todayYMD = new Date().toISOString().slice(0, 10);

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function formatDate(dateISO) {
  const d = new Date(dateISO);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}
function csvEscape(s) {
  if (s == null) return "";
  const str = String(s);
  return str.includes(",") || str.includes("\n") || str.includes("\"")
    ? '"' + str.replace(/\"/g, '""') + '"'
    : str;
}
function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function normalizeHeader(h) {
  if (!h) return "";
  return String(h).toLowerCase().replace(/\s+/g, "");
}
function toKeyedMap(arr, key) {
  return new Map(arr.map((x) => [x[key], x]));
}
function num(n, def = 0) {
  const v = Number(n);
  return isFinite(v) ? v : def;
}
function piecesFrom(boxes, pieces, packSize) {
  const ps = Math.max(1, num(packSize, 1));
  return Math.max(0, num(boxes) * ps + num(pieces));
}
function splitPieces(totalPieces, packSize) {
  const ps = Math.max(1, num(packSize, 1));
  const t = Math.max(0, num(totalPieces, 0));
  return { boxes: Math.floor(t / ps), pieces: t % ps };
}

// Dynamic columns for tables
const COLS_ALL = ["sku", "name", "stock", "imp", "sale", "date"]; // default
const COLS_BY_MODE = {
  all: ["sku", "name", "stock", "imp", "sale", "date"],
  stock: ["sku", "name", "stockBox", "stockPiece", "date"],
  import: ["sku", "name", "imp", "date"],
  sale: ["sku", "name", "sale", "date"],
};
const COL_LABEL = {
  sku: "SKU",
  name: "Tên sản phẩm",
  stock: "SL tồn",
  stockBox: "SL tồn (thùng)",
  stockPiece: "SL tồn (chiếc)",
  imp: "SL Nhập",
  sale: "SL Bán",
  date: "Ngày",
};

export default function App() {
  const [store, setStore] = useState({ products: [], txs: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setStore((s)=> ({...s, ...JSON.parse(raw)}));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {}
  }, [store]);

  const productsMap = useMemo(() => toKeyedMap(store.products, "sku"), [store.products]);

  // Undo stack (giới hạn 10 snapshot)
  const [undoStack, setUndoStack] = useState([]);
  function pushUndo(snapshot, reason = "") {
    const snap = JSON.parse(JSON.stringify(snapshot));
    setUndoStack((s) => [...s.slice(-9), { state: snap, reason }]);
  }
  function undoNow() {
    setUndoStack((s) => {
      if (!s.length) return s;
      const last = s[s.length - 1];
      setStore(last.state);
      toast.message(last.reason ? `Đã hoàn tác: ${last.reason}` : "Đã hoàn tác");
      return s.slice(0, -1);
    });
  }

  // Dashboard metrics (đơn vị chiếc)
  const totalUnits = useMemo(
    () => store.products.reduce((s, p) => s + (Number(p.stock) || 0), 0),
    [store.products]
  );
  const todayStr = new Date(todayISO()).toDateString();
  const salesToday = useMemo(
    () =>
      store.txs
        .filter((t) => t.type === "sale" && new Date(t.dateISO).toDateString() === todayStr)
        .reduce((s, t) => s + t.qty, 0),
    [store.txs, todayStr]
  );
  const importsToday = useMemo(
    () =>
      store.txs
        .filter((t) => t.type === "import" && new Date(t.dateISO).toDateString() === todayStr)
        .reduce((s, t) => s + t.qty, 0),
    [store.txs, todayStr]
  );

  // =============================
  // Transaction + Add-new
  // =============================
  const [txType, setTxType] = useState("import"); // import | sale | new
  const [txSku, setTxSku] = useState("");
  const [txName, setTxName] = useState("");
  const [txBoxes, setTxBoxes] = useState(0);
  const [txPieces, setTxPieces] = useState(0);
  const [txPack, setTxPack] = useState(0); // quy cách/ thùng
  const [txDate, setTxDate] = useState(() => todayYMD);

  function ensureInitialStockComputed(p) {
    if (p.initialStock != null) return p.initialStock;
    const net = store.txs
      .filter((t) => t.sku === p.sku)
      .reduce((a, t) => a + (t.type === "import" ? t.qty : -t.qty), 0);
    const approx = (Number(p.stock) || 0) - net;
    return Math.max(0, approx);
  }

  function findByNameExact(name) {
    const low = name.trim().toLowerCase();
    return store.products.find((p) => (p.name || "").toLowerCase() === low) || null;
  }

  function handleTxSkuChange(v) {
    setTxSku(v);
    if (txType === "new") return;
    const p = productsMap.get(v.trim());
    if (p) {
      setTxName(p.name || "");
      if (!txPack && p.packSize) setTxPack(p.packSize);
    }
  }
  function handleTxNameChange(v) {
    setTxName(v);
    if (txType === "new") return;
    const p = findByNameExact(v);
    if (p) {
      setTxSku(p.sku);
      if (!txPack && p.packSize) setTxPack(p.packSize);
    }
  }

  function piecesFromLocal(b, p, pack) {
    const ps = Math.max(1, Number(pack) || 1);
    return Math.max(0, (Number(b)||0) * ps + (Number(p)||0));
  }

  function recordTx() {
    const sku = txSku.trim();
    const name = txName.trim();
    const packInput = Math.max(0, Math.floor(Number(txPack) || 0));

    if (txType === "new") {
      if (!sku || !name) {
        toast.warning("Vui lòng nhập SKU & Tên sản phẩm");
        return;
      }
      if (packInput <= 0) {
        toast.warning("Vui lòng nhập Quy cách/ thùng (số nguyên > 0)");
        return;
      }
      const qtyPieces = piecesFromLocal(txBoxes, txPieces, packInput);
      setStore((prev) => {
        if (prev.products.find((p) => p.sku === sku)) {
          toast.error("SKU đã tồn tại, hãy dùng Nhập/Bán để cập nhật tồn");
          return prev;
        }
        const product = { sku, name, packSize: packInput, stock: qtyPieces, initialStock: qtyPieces };
        const newTx = ({
          id: String(Date.now()) + Math.random().toString(16).slice(2),
          type: "import",
          sku,
          name,
          qty: qtyPieces,
          dateISO: new Date(`${txDate || todayYMD}T00:00:00`).toISOString(),
        });
        const snap = { ...prev, products: [product, ...prev.products], txs: [newTx, ...prev.txs] }
        toast.success("Đã thêm sản phẩm mới thành công");
        return snap;
      });
      setTxBoxes(0); setTxPieces(0);
      return;
    }

    if (!sku) { toast.warning("Vui lòng nhập SKU"); return; }
    const target = productsMap.get(sku);
    const packUsed = Math.max(1, packInput || (target ? target.packSize : 1));
    const qtyPieces = piecesFromLocal(txBoxes, txPieces, packUsed);
    if (qtyPieces <= 0) { toast.warning("Vui lòng nhập số lượng > 0"); return; }

    setStore((prev) => {
      const next = [...prev.products];
      let idx = next.findIndex((p) => p.sku === sku);
      if (idx === -1) {
        if (!name) { toast.warning("SKU chưa tồn tại, vui lòng nhập Tên để tạo mới"); return prev; }
        next.push({ sku, name, packSize: packUsed, stock: 0, initialStock: 0 });
        idx = next.findIndex((p) => p.sku === sku);
      }
      const p = next[idx];
      if (packInput > 0 && packInput !== p.packSize) p.packSize = packInput;

      let updated;
      if (txType === "import") {
        updated = { ...p, name: p.name || name, stock: (p.stock || 0) + qtyPieces, initialStock: (p.initialStock ?? ensureInitialStockComputed(p)) };
      } else {
        const current = p.stock || 0;
        if (qtyPieces > current) { toast.error("Vượt quá số lượng tồn , vui lòng kiểm tra lại"); return prev; }
        updated = { ...p, name: p.name || name, stock: current - qtyPieces, initialStock: (p.initialStock ?? ensureInitialStockComputed(p)) };
      }
      const newTx = {
        id: String(Date.now()) + Math.random().toString(16).slice(2),
        type: txType,
        sku,
        name: updated.name,
        qty: qtyPieces,
        dateISO: new Date(`${txDate || todayYMD}T00:00:00`).toISOString(),
      };
      next[idx] = updated;
      toast.success(txType === "import" ? "Đã nhập kho thành công" : "Đã ghi nhận bán ra thành công");
      return { ...prev, products: next, txs: [newTx, ...prev.txs] };
    });
    setTxBoxes(0); setTxPieces(0);
  }

  // Excel helpers
  function readSheet(file, onRows) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      onRows(rows);
    };
    reader.readAsArrayBuffer(file);
  }

  function showMissingWarnings(missingLines) {
    if (missingLines.length > 0) {
      const preview = missingLines.slice(0, 8).join(", ");
      const more = missingLines.length > 8 ? ` …(+${missingLines.length - 8})` : "";
      toast.warning(`File thiếu dữ liệu Tên/SKU dòng ${preview}${more}, vui lòng kiểm tra lại`);
    }
  }

  // Catalog import
  function importCatalog(file) {
    readSheet(file, (rows) => {
      let added = 0, updated = 0;
      const missing = [];
      setStore((prev) => {
        const map = toKeyedMap(prev.products, "sku");
        rows.forEach((r, idx) => {
          const e = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase().replace(/\\s+/g, ''), v]));
          const sku = String(((e["sku"]) || "")).trim();
          const name = String((((e["tênsảnphẩm"] ?? e["tensanpham"] ?? e["ten"] ?? e["name"])) || "")).trim();
          const pack = Math.max(1, Math.floor(Number(e["quycachdonghang"] ?? e["quycachdongthung"] ?? e["packsize"] ?? e["packsz"] || 1)));
          if (!sku || !name) { missing.push(idx + 2); return; }
          if (map.has(sku)) {
            const p = map.get(sku);
            p.name = name || p.name;
            p.packSize = pack || p.packSize || 1;
            updated++;
          } else {
            map.set(sku, { sku, name, packSize: pack, stock: 0, initialStock: 0 });
            added++;
          }
        });
        toast.success(`Up file "Các mã sản phẩm" thành công: thêm ${added}, cập nhật ${updated}`);
        showMissingWarnings(missing);
        return { ...prev, products: Array.from(map.values()) };
      });
    });
  }

  function importCurrentStock(file) {
    readSheet(file, (rows) => {
      let up = 0, add = 0;
      const missing = [];
      setStore((prev) => {
        const map = toKeyedMap(prev.products, "sku");
        rows.forEach((r, idx) => {
          const e = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase().replace(/\\s+/g, ''), v]));
          const sku = String(((e["sku"]) || "")).trim();
          const name = String((((e["tênsảnphẩm"] ?? e["tensanpham"] ?? e["ten"] ?? e["name"])) || "")).trim();
          const boxes = Number(e["sốlượngthùng"] ?? e["soluongthung"] ?? e["thung"] || 0);
          const loose = Number(e["sốlượngchiếc"] ?? e["soluongchiec"] ?? e["chiec"] || 0);
          if (!sku || !name) { missing.push(idx + 2); return; }
          const p = map.get(sku) || { sku, name, packSize: 1, stock: 0, initialStock: 0 };
          if (!map.has(sku)) add++; else up++;
          const ps = Math.max(1, p.packSize || 1);
          const total = Math.max(0, boxes*ps + loose);
          p.name = p.name || name;
          p.stock = total;
          if (p.initialStock == null) p.initialStock = total;
          map.set(sku, p);
        });
        toast.success(`Up file "Tồn kho hiện tại" thành công: thêm ${add}, cập nhật ${up}`);
        showMissingWarnings(missing);
        return { ...prev, products: Array.from(map.values()) };
      });
    });
  }

  function importTodayImports(file) {
    const uploadDateISO = new Date(`${todayYMD}T00:00:00`).toISOString();
    readSheet(file, (rows) => {
      let count = 0;
      const missing = [];
      setStore((prev) => {
        const map = toKeyedMap(prev.products, "sku");
        const txs = [...prev.txs];
        rows.forEach((r, idx) => {
          const e = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase().replace(/\\s+/g, ''), v]));
          const sku = String((((e["mãsảnphẩm"] ?? e["masanpham"] ?? e["sku"])) || "")).trim();
          const name = String((((e["tênsảnphẩm"] ?? e["tensanpham"] ?? e["ten"] ?? e["name"])) || "")).trim();
          const boxes = Number(e["sốlượngthùng"] ?? e["soluongthung"] ?? e["thung"] || 0);
          if (!sku || !name) { missing.push(idx + 2); return; }
          if (boxes <= 0) return;
          const p = map.get(sku) || { sku, name, packSize: 1, stock: 0, initialStock: 0 };
          const ps = Math.max(1, p.packSize || 1);
          const qtyPieces = Math.max(0, boxes*ps);
          p.name = p.name || name;
          p.stock = (p.stock || 0) + qtyPieces;
          if (p.initialStock == null) p.initialStock = (p.stock || 0);
          map.set(sku, p);
          txs.unshift({
            id: String(Date.now()) + Math.random().toString(16).slice(2),
            type: "import",
            sku,
            name: p.name,
            qty: qtyPieces,
            dateISO: uploadDateISO,
          });
          count++;
        });
        toast.success(`Up file "Nhập hôm nay" thành công: ${count} dòng nhập`);
        showMissingWarnings(missing);
        return { ...prev, products: Array.from(map.values()), txs };
      });
    });
  }

  // CHECK
  const [chkSKU, setChkSKU] = useState("");
  const [chkName, setChkName] = useState("");
  const [chkDate, setChkDate] = useState(""); // yyyy-mm-dd
  const [chkStatus, setChkStatus] = useState("stock");
  const [chkRows, setChkRows] = useState([]);

  function stockAsOfDate(p, dateStr) {
    const initial = (p.initialStock ?? 0);
    if (!dateStr) return p.stock;
    const until = new Date(dateStr); until.setHours(23,59,59,999);
    const net = store.txs
      .filter((t) => t.sku === p.sku && new Date(t.dateISO) <= until)
      .reduce((a, t) => a + (t.type === "import" ? t.qty : -t.qty), 0);
    return Math.max(0, Number(initial) + net);
  }

  function runCheck() {
    const nameQ = chkName.trim().toLowerCase();
    const skuQ = chkSKU.trim().toLowerCase();
    const dateQ = chkDate || "";
    const candidates = store.products.filter(
      (p) => (skuQ ? p.sku.toLowerCase().includes(skuQ) : true) && (nameQ ? (p.name || "").toLowerCase().includes(nameQ) : true)
    );
    const rows = [];
    candidates.forEach((p) => {
      const ps = Math.max(1, p.packSize || 1);
      if (chkStatus === "stock") {
        const total = stockAsOfDate(p, dateQ);
        const sp = splitPieces(total, ps);
        rows.push({ sku: p.sku, name: p.name, stockBox: sp.boxes, stockPiece: sp.pieces, imp: "", sale: "", date: dateQ ? formatDate(new Date(dateQ).toISOString()) : "" });
      } else if (chkStatus === "import" || chkStatus === "sale") {
        const day = dateQ ? new Date(dateQ).toDateString() : null;
        const txs = store.txs.filter((t) => t.sku === p.sku && t.type === chkStatus && (!day || new Date(t.dateISO).toDateString() === day));
        const sum = txs.reduce((s, t) => s + t.qty, 0);
        rows.push({ sku: p.sku, name: p.name, stock: "", imp: chkStatus === "import" ? sum : "", sale: chkStatus === "sale" ? sum : "", date: dateQ ? formatDate(new Date(dateQ).toISOString()) : "" });
      } else {
        const day = dateQ ? new Date(dateQ).toDateString() : null;
        const imp = store.txs
          .filter((t) => t.sku === p.sku && t.type === "import" && (!day || new Date(t.dateISO).toDateString() === day))
          .reduce((s, t) => s + t.qty, 0);
        const sale = store.txs
          .filter((t) => t.sku === p.sku && t.type === "sale" && (!day || new Date(t.dateISO).toDateString() === day))
          .reduce((s, t) => s + t.qty, 0);
        const total = stockAsOfDate(p, dateQ);
        rows.push({ sku: p.sku, name: p.name, stock: total, imp, sale, date: dateQ ? formatDate(new Date(dateQ).toISOString()) : "" });
      }
    });
    setChkRows(rows);
  }

  // REPORTS
  const [viewMode, setViewMode] = useState("stock");
  const [fSKU, setFSKU] = useState("");
  const [fName, setFName] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  function matchByProduct(p) {
    const skuOk = fSKU ? p.sku.toLowerCase().includes(fSKU.trim().toLowerCase()) : true;
    const nameOk = fName ? (p.name || "").toLowerCase().includes(fName.trim().toLowerCase()) : true;
    return skuOk && nameOk;
  }
  function inRange(dateISO) {
    const d = new Date(dateISO);
    if (fFrom) { const from = new Date(fFrom); if (d < new Date(from.setHours(0, 0, 0, 0))) return false; }
    if (fTo) { const to = new Date(fTo); if (d > new Date(to.setHours(23, 59, 59, 999))) return false; }
    return true;
  }
  const dateRangeLabel = useMemo(() => {
    if (!fFrom && !fTo) return "";
    const fmt = (s) => {
      if (!s) return "";
      const d = new Date(s);
      return d.toLocaleDateString();
    };
    if (fFrom && fTo) return `${fmt(fFrom)} – ${fmt(fTo)}`;
    return fFrom ? `Từ ${fmt(fFrom)}` : `Đến ${fmt(fTo)}`;
  }, [fFrom, fTo]);

  const reportRows = useMemo(() => {
    const rows = [];
    const candidates = store.products.filter(matchByProduct);
    candidates.forEach((p) => {
      const ps = Math.max(1, p.packSize || 1);
      if (viewMode === "stock") {
        const atDate = fTo || todayYMD;
        const total = stockAsOfDate(p, atDate);
        const sp = splitPieces(total, ps);
        rows.push({ sku: p.sku, name: p.name, stockBox: sp.boxes, stockPiece: sp.pieces, date: dateRangeLabel });
      } else if (viewMode === "import" || viewMode === "sale") {
        const type = viewMode;
        const sum = store.txs
          .filter((t) => t.sku === p.sku && t.type === type && inRange(t.dateISO))
          .reduce((s, t) => s + t.qty, 0);
        rows.push({ sku: p.sku, name: p.name, imp: type === "import" ? sum : "", sale: type === "sale" ? sum : "", date: dateRangeLabel });
      } else {
        const imp = store.txs
          .filter((t) => t.sku === p.sku && t.type === "import" && inRange(t.dateISO))
          .reduce((s, t) => s + t.qty, 0);
        const sale = store.txs
          .filter((t) => t.sku === p.sku && t.type === "sale" && inRange(t.dateISO))
          .reduce((s, t) => s + t.qty, 0);
        const atDate = fTo || todayYMD;
        const total = stockAsOfDate(p, atDate);
        rows.push({ sku: p.sku, name: p.name, stock: total, imp, sale, date: dateRangeLabel });
      }
    });
    return rows;
  }, [store.products, store.txs, viewMode, fSKU, fName, fFrom, fTo, dateRangeLabel]);

  function eachDateYMD(from, to) {
    const res = [];
    if (!from || !to) return res;
    const d1 = new Date(from), d2 = new Date(to);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) res.push(new Date(d).toISOString().slice(0, 10));
    return res;
  }
  function exportStockDailyCSV() {
    if (!fFrom || !fTo) { toast.warning("Vui lòng chọn Từ ngày và Đến ngày để xuất tồn theo ngày"); return; }
    const days = eachDateYMD(fFrom, fTo);
    if (days.length === 0) { toast.warning("Khoảng ngày không hợp lệ"); return; }
    const header = ["SKU", "Tên sản phẩm"];
    days.forEach((d) => {
      const label = new Date(d).toLocaleDateString();
      header.push(`SL tồn thùng (${label})`, `SL tồn chiếc (${label})`);
    });
    const rows = [header];
    const candidates = store.products.filter(matchByProduct);
    candidates.forEach((p) => {
      const ps = Math.max(1, p.packSize || 1);
      const line = [p.sku, p.name];
      days.forEach((d) => {
        const total = stockAsOfDate(p, d);
        const sp = splitPieces(total, ps);
        line.push(sp.boxes, sp.pieces);
      });
      rows.push(line);
    });
    downloadCSV(`bao-cao-ton-theo-ngay_${fFrom}_to_${fTo}.csv`, rows);
  }

  // Filters for history (not fully rendered in this embedded version to keep it smaller)

  const checkCols = COLS_BY_MODE[chkStatus] || COLS_ALL;
  const reportCols = COLS_BY_MODE[viewMode] || COLS_ALL;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management (Desktop)</h1>
          <p className="text-sm text-gray-500">Windows · Offline-first · Nhập tay / Excel</p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tổng tồn (chiếc)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{totalUnits}</CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bán hôm nay (chiếc)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{salesToday}</CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nhập hôm nay (chiếc)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{importsToday}</CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Ghi nhận giao dịch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tác vụ</Label>
                <Select value={txType} onValueChange={setTxType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="import">Nhập kho</SelectItem>
                    <SelectItem value="sale">Bán ra</SelectItem>
                    <SelectItem value="new">Thêm sản phẩm mới</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ngày</Label>
                <Input type="date" max={todayYMD} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SKU</Label>
                {txType !== "new" ? (
                  <Input placeholder="VD: SP-001" value={txSku} onChange={(e) => handleTxSkuChange(e.target.value)} list="sku-list" />
                ) : (
                  <Input placeholder="SKU mới (không gợi ý)" value={txSku} onChange={(e) => setTxSku(e.target.value)} />
                )}
                <datalist id="sku-list">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>{txType === "new" ? "Tên sản phẩm (bắt buộc)" : "Tên hàng"}</Label>
                <Input
                  placeholder={txType === "new" ? "VD: Bánh quy bơ" : "Nhập tên hoặc để tự điền"}
                  value={txName}
                  onChange={(e) => handleTxNameChange(e.target.value)}
                  list="name-list"
                />
                <datalist id="name-list">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.name}>
                      {p.sku}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <Label>Quy cách/ thùng</Label>
                <Input
                  type="number"
                  min={1}
                  value={txPack}
                  onChange={(e) => setTxPack(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  placeholder="VD: 20"
                />
                {txSku && productsMap.get(txSku) && (
                  <div className="text-xs text-gray-500 mt-1">
                    Hiện tại: {(productsMap.get(txSku) || {}).packSize || 1}/thùng
                  </div>
                )}
              </div>
              <div>
                <Label>Số lượng thùng</Label>
                <Input type="number" min={0} value={txBoxes} onChange={(e) => setTxBoxes(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div>
                <Label>Số lượng chiếc</Label>
                <Input type="number" min={0} value={txPieces} onChange={(e) => setTxPieces(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="w-full" onClick={recordTx}>
                <Plus className="w-4 h-4 mr-2" />
                Ghi nhận
              </Button>
            </div>

            <Separator />

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileUp className="w-4 h-4 mr-2" />
                  Import Excel
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                  <DialogTitle>Nhập dữ liệu từ Excel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 border rounded-xl">
                    <h4 className="font-medium mb-2">Các mã sản phẩm</h4>
                    <p className="text-sm text-gray-500 mb-3">
                      Cột: <Badge variant="secondary">SKU</Badge>, <Badge variant="secondary">Tên Sản Phẩm</Badge>, <Badge variant="secondary">Quy cách đóng hàng</Badge>
                    </p>
                    <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files && importCatalog(e.target.files[0])} />
                  </div>
                  <div className="p-4 border rounded-xl">
                    <h4 className="font-medium mb-2">Tồn kho hiện tại</h4>
                    <p className="text-sm text-gray-500 mb-3">
                      Cột: <Badge variant="secondary">SKU</Badge>, <Badge variant="secondary">Tên Sản Phẩm</Badge>, <Badge variant="secondary">Số lượng thùng</Badge>, <Badge variant="secondary">Số lượng chiếc</Badge>
                    </p>
                    <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files && importCurrentStock(e.target.files[0])} />
                  </div>
                  <div className="p-4 border rounded-xl">
                    <h4 className="font-medium mb-2">Nhập hôm nay</h4>
                    <p className="text-sm text-gray-500 mb-3">
                      Cột: <Badge variant="secondary">Mã Sản Phẩm</Badge>, <Badge variant="secondary">Tên Sản Phẩm</Badge>, <Badge variant="secondary">Số lượng Thùng</Badge>
                    </p>
                    <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files && importTodayImports(e.target.files[0])} />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Check thông tin sản phẩm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SKU</Label>
                <Input list="sku-check" placeholder="Nhập hoặc chọn" value={chkSKU} onChange={(e) => setChkSKU(e.target.value)} />
                <datalist id="sku-check">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Tên sản phẩm</Label>
                <Input list="name-check" placeholder="Nhập tên" value={chkName} onChange={(e) => setChkName(e.target.value)} />
                <datalist id="name-check">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.name}>
                      {p.sku}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ngày</Label>
                <Input type="date" max={todayYMD} value={chkDate} onChange={(e) => setChkDate(e.target.value)} />
              </div>
              <div>
                <Label>Trạng thái</Label>
                <Select value={chkStatus} onValueChange={setChkStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="stock">Tồn</SelectItem>
                    <SelectItem value="import">Nhập</SelectItem>
                    <SelectItem value="sale">Bán</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={runCheck}>Check</Button>
            </div>
            <div className="rounded-xl border overflow-auto max-h-[260px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {checkCols.map((c) => (
                      <th key={c} className={`p-2 ${["stock", "imp", "sale", "stockBox", "stockPiece"].includes(c) ? "text-right" : "text-left"}`}>
                        {COL_LABEL[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chkRows.map((r, i) => (
                    <tr key={r.sku + String(i)} className="border-b">
                      {checkCols.map((c) => (
                        <td key={c} className={`p-2 ${["stock", "imp", "sale", "stockBox", "stockPiece"].includes(c) ? "text-right" : ""}`}>
                          {r[c] !== "" ? r[c] : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {chkRows.length === 0 && (
                    <tr>
                      <td colSpan={checkCols.length} className="p-4 text-center text-gray-500">
                        Chưa có kết quả
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Báo cáo & Lọc</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center flex-wrap gap-3 mb-3">
              <Button variant="outline" onClick={exportStockDailyCSV}>
                <Download className="w-4 h-4 mr-2" />
                Xuất CSV tồn theo ngày
              </Button>
              <div className="flex items-center gap-2">
                <Label>Chế độ</Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="stock">Tồn</SelectItem>
                    <SelectItem value="import">Nhập</SelectItem>
                    <SelectItem value="sale">Bán</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <Label>SKU</Label>
                <Input list="sku-report" placeholder="VD: SP-001" value={fSKU} onChange={(e) => setFSKU(e.target.value)} />
                <datalist id="sku-report">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Tên sản phẩm</Label>
                <Input list="name-report" placeholder="VD: Bánh quy" value={fName} onChange={(e) => setFName(e.target.value)} />
                <datalist id="name-report">
                  {store.products.slice(0, 500).map((p) => (
                    <option key={p.sku} value={p.name}>
                      {p.sku}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Từ ngày</Label>
                <Input type="date" max={todayYMD} value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
              </div>
              <div>
                <Label>Đến ngày</Label>
                <Input type="date" max={todayYMD} value={fTo} onChange={(e) => setFTo(e.target.value)} />
              </div>
            </div>

            <div className="rounded-xl border overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {reportCols.map((c) => (
                      <th key={c} className={`p-2 ${["stock", "imp", "sale", "stockBox", "stockPiece"].includes(c) ? "text-right" : "text-left"}`}>
                        {COL_LABEL[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((r, idx) => (
                    <tr key={r.sku + idx} className="border-b">
                      {reportCols.map((c) => (
                        <td key={c} className={`p-2 ${["stock", "imp", "sale", "stockBox", "stockPiece"].includes(c) ? "text-right" : ""}`}>
                          {r[c] !== "" ? r[c] : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {reportRows.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-500" colSpan={reportCols.length}>
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="text-xs text-gray-500 text-center py-2">
        Dữ liệu lưu cục bộ (localStorage). Dùng GitHub Actions trong thư mục này để build .exe NSIS.
      </footer>
    </div>
  );}
