import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { FIXED_FIELDS, type FixedKey, type Shot, type ShotForm } from "./types";

const defaultColumns: FixedKey[] = ["iplen", "Uc", "Ib", "Im"];
const dateLabels = ["Serial", "shot", "date"];

function InlineEdit({ shotId, onClose }: { shotId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["shot", shotId], queryFn: () => api.get(shotId) });
  const [draft, setDraft] = useState<ShotForm | null>(null);
  const [error, setError] = useState("");
  const saved = useRef("");
  useEffect(() => {
    if (!query.data) return;
    const { id: _id, ...rest } = query.data;
    void _id;
    setDraft(rest);
    saved.current = JSON.stringify(rest);
  }, [query.data]);
  const changed = draft !== null && JSON.stringify(draft) !== saved.current;
  const update = useMutation({
    mutationFn: (form: ShotForm) => api.update(shotId, form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shots"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["shot", shotId] }),
      ]);
      onClose();
    },
  });
  function attemptClose() {
    if (!changed || window.confirm("这行存在未保存的更改。要放弃修改吗？")) onClose();
  }
  if (query.isPending || !draft) return <div className="v11-inline"><p>正在加载可编辑字段...</p><button onClick={attemptClose}>取消</button></div>;
  if (query.isError) return <div className="form-error">无法加载炮次 <button onClick={attemptClose}>关闭</button></div>;
  return <div className="v11-inline">
    <div className="v11-panel-heading"><strong>编辑本行：{draft.Serial} / {draft.shot}</strong>
      <Link to={"/records/" + shotId + "/edit"}>完整编辑（修改自定义参数定义）</Link></div>
    <div className="v11-edit-fields">
      <label>日期<input type="date" value={draft.date || ""} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      {FIXED_FIELDS.map(field => <label key={field.key}>{field.label} ({field.unit})
        <input inputMode="decimal" value={draft[field.key] ?? ""}
          onChange={e => setDraft(prev => prev && ({ ...prev, [field.key]: e.target.value }))} /></label>)}
      {draft.custom_parameters?.map((p, index) => <label key={p.id ?? p.name}>{p.name} · 值
        <input value={p.value ?? ""} onChange={e => setDraft(prev => prev && ({
          ...prev, custom_parameters: (prev.custom_parameters || []).map((entry, i) =>
            i === index ? { ...entry, value: e.target.value } : entry),
        }))} /></label>)}
    </div>
    {error && <div role="alert" className="form-error">{error}</div>}
    <div className="v11-inline-actions"><button className="btn btn-secondary" onClick={attemptClose}>取消</button>
      <button className="btn btn-primary" disabled={!changed || update.isPending}
        onClick={async () => { try { await update.mutateAsync(draft); } catch (exc) { setError(String(exc)); } }}>
        {update.isPending ? "正在保存..." : "保存本行"}</button></div>
  </div>;
}

export default function RecordsV11() {
  const [params, setParams] = useSearchParams();
  const serials = useQuery({ queryKey: ["serials"], queryFn: api.serials });
  const client = useQueryClient();
  const serial = params.get("serial") || "";
  const [advanced, setAdvanced] = useState(false);
  const [columns, setColumns] = useState<FixedKey[]>(() => {
    try { return JSON.parse(localStorage.getItem("gyrotron-fixed-columns") || "null") || defaultColumns; }
    catch { return defaultColumns; }
  });
  const suggestions = useQuery({ queryKey: ["suggestions", serial], queryFn: () => api.suggestions(serial), enabled: !!serial });
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [rowDraft, setRowDraft] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [scroll, setScroll] = useState(0);
  const scrollBox = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [colSettings, setColSettings] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem("gyrotron-density") === "compact");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  useEffect(() => {
    if (serial || !serials.data?.length) return;
    const old = localStorage.getItem("gyrotron-current-serial");
    const preferred = old && serials.data.some(s => s.name === old) ? old : serials.data[0].name;
    setParams(previous => { const copy = new URLSearchParams(previous); copy.set("serial", preferred); return copy; }, { replace: true });
  }, [serial, serials.data, setParams]);
  useEffect(() => {
    if (serial) localStorage.setItem("gyrotron-current-serial", serial);
    try { setCustomCols(JSON.parse(localStorage.getItem("gyrotron-custom-cols-" + serial) || "[]")); }
    catch { setCustomCols([]); }
    setSelected([]); setRowDraft(null); setScroll(0);
    if (scrollBox.current) scrollBox.current.scrollTop = 0;
  }, [serial]);
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of ["serial", "shot", "date_from", "date_to", "iplen_state", "iplen_min", "iplen_max", "search"]) {
      if (params.get(key)) result[key] = params.get(key)!;
    }
    const paramName = params.get("param_name");
    if (paramName) result.custom_filters = JSON.stringify([{ name: paramName, operator: "contains", value: params.get("param_value") || "" }]);
    return result;
  }, [params]);
  const listing = useInfiniteQuery({
    queryKey: ["shots", filters], initialPageParam: 1,
    queryFn: ({ pageParam }) => api.filtered(filters, pageParam as number),
    getNextPageParam: (last, pages) => pages.reduce((sum, p) => sum + p.items.length, 0) < last.total ? pages.length + 1 : undefined,
    enabled: !!serial,
  });
  const items = listing.data?.pages.flatMap(page => page.items) || [];
  const rows = sort === "asc" ? [...items].sort((a, b) => BigInt(a.shot) < BigInt(b.shot) ? -1 : BigInt(a.shot) > BigInt(b.shot) ? 1 : 0) : items;
  const cols = columns.filter(key => FIXED_FIELDS.some(f => f.key === key));
  const total = listing.data?.pages[0]?.total ?? 0;
  const rowHeight = compact ? 36 : 44;
  const start = Math.max(0, Math.floor(scroll / rowHeight) - 8);
  const visible = rows.slice(start, start + 32);
  const colCount = 5 + cols.length + customCols.length;
  function setFilter(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  }
  function changeSerial(value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("serial", value); return next; });
  }
  function toggleColumn(key: FixedKey) {
    const update = columns.includes(key) ? columns.filter(k => k !== key) : [...columns, key];
    setColumns(update); localStorage.setItem("gyrotron-fixed-columns", JSON.stringify(update));
  }
  function toggleCustom(name: string) {
    const update = customCols.includes(name) ? customCols.filter(c => c !== name) : [...customCols, name];
    setCustomCols(update); localStorage.setItem("gyrotron-custom-cols-" + serial, JSON.stringify(update));
  }
  async function deleteFiltered(onlySelected = false) {
    const requestFilters: Record<string, unknown> = { ...filters };
    if (onlySelected) requestFilters.ids = selected;
    try {
      setBusy("正在确认删除范围...");
      const preview = await api.deletePreview(requestFilters);
      if (preview.count === 0) { setBusy(""); return; }
      if (!window.confirm("即将永久删除 " + preview.count + " 炮记录及其自定义参数。\nSerial：" + serial +
          "\n筛选：" + JSON.stringify(requestFilters) + "\n此操作无法撤销，确定继续？")) {
        setBusy(""); return;
      }
      setBusy("正在删除...");
      await api.bulkDelete(requestFilters, preview.snapshot);
      setSelected([]);
      await Promise.all([client.invalidateQueries({ queryKey: ["shots"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }), client.invalidateQueries({ queryKey: ["serials"] })]);
      setBusy("");
    } catch (err) { setError(String(err)); setBusy(""); }
  }
  const busyLoading = listing.isPending || (listing.isFetching && !listing.data);
  return <div className="v11-records">
    <div className="v11-heading"><div><h1>炮次记录</h1><p>按 Serial 管理、筛选与编辑历史炮次</p></div>
      <Link className="btn btn-primary" to={"/records/new?serial=" + encodeURIComponent(serial)}>+ 新增炮次</Link></div>
    <section className="v11-toolbar">
      <label>回旋管 <select aria-label="选择 Serial" value={serial} onChange={e => changeSerial(e.target.value)}>
        {!serial && <option value="">选择 Serial</option>}
        {serials.data?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select></label>
      <label>炮号 <input placeholder="精确炮号" value={params.get("shot") || ""} onChange={e => setFilter("shot", e.target.value)} /></label>
      <button className="btn btn-secondary" onClick={() => setAdvanced(!advanced)}>{advanced ? "收起高级筛选" : "高级筛选"}</button>
      <button className="btn btn-secondary" onClick={() => setColSettings(!colSettings)}>列设置</button>
      <button className="btn btn-secondary" onClick={() => void listing.refetch()}>刷新</button>
    </section>
    {advanced && <section className="v11-toolbar v11-advanced">
      <label>开始日期<input type="date" value={params.get("date_from") || ""} onChange={e => setFilter("date_from", e.target.value)} /></label>
      <label>结束日期<input type="date" value={params.get("date_to") || ""} onChange={e => setFilter("date_to", e.target.value)} /></label>
      <label>脉宽状态<select value={params.get("iplen_state") || ""} onChange={e => setFilter("iplen_state", e.target.value)}>
        <option value="">全部</option><option value="positive">正脉宽</option><option value="missing">非正或缺失</option></select></label>
      <label>脉宽下限<input value={params.get("iplen_min") || ""} onChange={e => setFilter("iplen_min", e.target.value)} /></label>
      <label>脉宽上限<input value={params.get("iplen_max") || ""} onChange={e => setFilter("iplen_max", e.target.value)} /></label>
      <label>自定义参数名<input value={params.get("param_name") || ""} onChange={e => setFilter("param_name", e.target.value)} /></label>
      <label>自定义参数值包含<input value={params.get("param_value") || ""} onChange={e => setFilter("param_value", e.target.value)} /></label>
      <button className="btn btn-secondary" onClick={() => {
        setParams({ serial });
      }}>清空筛选</button>
    </section>}
    {colSettings && <section className="v11-toolbar v11-cols">
      <strong>固定参数列</strong>{FIXED_FIELDS.map(f => <label key={f.key}>
        <input type="checkbox" checked={cols.includes(f.key)} onChange={() => toggleColumn(f.key)} />{f.label}</label>)}
      <strong>自定义参数列（按 Serial 记忆）</strong>
      {suggestions.data?.map(item => <label key={item.name}>
        <input type="checkbox" checked={customCols.includes(item.name)} onChange={() => toggleCustom(item.name)} />{item.name}</label>)}
      <label><input type="checkbox" checked={compact} onChange={e => {
        setCompact(e.target.checked); localStorage.setItem("gyrotron-density", e.target.checked ? "compact" : "comfortable");
      }} />紧凑行高</label>
    </section>}
    <section className="v11-toolbar v11-actions">
      <span>当前条件共 <strong>{total}</strong> 炮 · 已加载 {items.length} 炮</span>
      <div>
        <a className="btn btn-secondary" href={api.exportURL(filters, "xlsx")}>导出 Excel</a>
        <a className="btn btn-secondary" href={api.exportURL(filters, "csv")}>导出 CSV ZIP</a>
        <button className="btn btn-secondary" disabled={!selected.length || !!busy} onClick={() => void deleteFiltered(true)}>删除选中 ({selected.length})</button>
        <button className="btn btn-secondary v11-danger" disabled={!total || !!busy} onClick={() => void deleteFiltered()}>删除全部筛选结果</button>
      </div>
    </section>
    {busy && <p role="status">{busy}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {listing.isError && <p className="form-error">加载失败：{String(listing.error)}</p>}
    <div className={"v11-table-viewport " + (compact ? "v11-compact" : "")} ref={scrollBox}
      onScroll={event => {
        const target = event.currentTarget;
        setScroll(target.scrollTop);
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 350 && listing.hasNextPage && !listing.isFetchingNextPage) {
          void listing.fetchNextPage();
        }
      }}>
      <table className="v11-table"><thead><tr>
        <th className="v11-pin"><input type="checkbox" aria-label="选择已加载炮次" checked={!!items.length && selected.length === items.length}
          onChange={e => setSelected(e.target.checked ? items.map(row => row.id) : [])} /></th>
        {dateLabels.map(label => <th key={label} className={label === "Serial" || label === "shot" ? "v11-pin" : ""}>
          {label === "Serial" ? "Serial" : label === "shot" ? <button onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>shot {sort === "desc" ? "↓" : "↑"}</button> : "日期"}</th>)}
        {cols.map(key => <th key={key}>{FIXED_FIELDS.find(f => f.key === key)?.label} ({FIXED_FIELDS.find(f => f.key === key)?.unit})</th>)}
        {customCols.map(name => <th key={name}>{name}</th>)}<th>操作</th>
      </tr></thead><tbody>
        {start > 0 && <tr aria-hidden="true"><td colSpan={colCount} style={{ padding: 0, height: start * rowHeight }} /></tr>}
        {visible.map(row => <FragmentRow key={row.id} row={row} colCount={colCount} cols={cols} customCols={customCols}
          selected={selected.includes(row.id)} toggle={() => setSelected(p => p.includes(row.id) ? p.filter(id => id !== row.id) : [...p, row.id])}
          editing={rowDraft === row.id} edit={() => {
            if (rowDraft !== null && rowDraft !== row.id) return;
            setRowDraft(rowDraft === row.id ? null : row.id);
          }} close={() => setRowDraft(null)} />)}
        {rows.length > start + visible.length && <tr aria-hidden="true"><td colSpan={colCount} style={{ padding: 0, height: (rows.length - start - visible.length) * rowHeight }} /></tr>}
      </tbody></table>
      {busyLoading && <div className="loading-state">正在加载炮次...</div>}
      {listing.isFetchingNextPage && <div className="v11-muted">正在继续加载...</div>}
      {listing.data && total === 0 && <div className="empty-small">没有符合条件的炮次</div>}
    </div>
  </div>;
}

function FragmentRow({ row, cols, customCols, colCount, selected, toggle, editing, edit, close }: {
  row: Shot; cols: FixedKey[]; customCols: string[]; colCount: number;
  selected: boolean; toggle: () => void; editing: boolean; edit: () => void; close: () => void;
}) {
  return <>
    <tr className={editing ? "v11-editing-row" : ""}>
      <td className="v11-pin"><input type="checkbox" aria-label={"选择第" + row.shot + "炮"} checked={selected} onChange={toggle} /></td>
      <td className="v11-pin">{row.Serial}</td><td className="v11-pin">{row.shot}</td>
      <td>{row.date || "—"}</td>
      {cols.map(key => <td key={key}>{row[key] ?? "—"}</td>)}
      {customCols.map(name => {
        const p = row.custom_parameters?.find(item => item.name === name);
        return <td key={name}>{!p ? "未添加" : p.value === null || p.value === "" ? "未填写" : p.value}</td>;
      })}
      <td><button className="v11-cell-action" onClick={edit}>{editing ? "关闭" : "编辑本行"}</button>
        <Link className="v11-cell-action" to={"/records/" + row.id + "/edit"}>完整编辑</Link></td>
    </tr>
    {editing && <tr><td colSpan={colCount}><InlineEdit shotId={row.id} onClose={close} /></td></tr>}
  </>;
}
