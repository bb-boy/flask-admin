import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, BarChart3, CalendarDays,
  Check, ChevronLeft, ChevronRight, CircleHelp, Database, FilePlus2, FlaskConical,
  Gauge, Layers3, LayoutDashboard, LoaderCircle, Menu, Pencil, Plus, RefreshCw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api";
import {
  FIXED_FIELDS, PARAMETER_TYPES, blankParameter, blankShot,
  type CustomParameter, type FixedKey, type Shot, type ShotForm,
} from "./types";

const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const formatDate = (date: string | null) => date || "未填写";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试";

function Spinner({ label = "正在加载..." }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle size={22} className="animate-spin" /><span>{label}</span></div>;
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="error-state" role="alert">
    <CircleHelp size={28} />
    <strong>数据加载失败</strong><span>{errorMessage(error)}</span>
    <button className="btn btn-secondary" onClick={retry}><RefreshCw size={15} />重新加载</button>
  </div>;
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [
    { path: "/", label: "数据概览", icon: LayoutDashboard, end: true },
    { path: "/records", label: "炮次记录", icon: Database, end: false },
    { path: "/records/new", label: "新建炮次", icon: FilePlus2, end: true },
  ];

  return <div className="app-shell">
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" />}
    <aside className={"sidebar " + (menuOpen ? "sidebar-open" : "")}>
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
        <span className="brand-logo"><Activity size={23} strokeWidth={2.3} /></span>
        <span><strong>回旋管数据平台</strong><small>实验运行参数记录系统</small></span>
      </Link>
      <div className="sidebar-label">工作空间</div>
      <nav className="sidebar-nav" aria-label="主导航">
        {navigation.map(({ path, label, icon: Icon, end }) =>
          <NavLink key={path} to={path} end={end}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => "nav-item " + (isActive && (path !== "/records" || !location.pathname.endsWith("/new")) ? "nav-item-active" : "")}>
            <Icon size={18} /><span>{label}</span>
            {path === "/records/new" && <Plus size={14} className="ml-auto opacity-65" />}
          </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-status"><span className="status-dot" />系统已连接</span>
        <div className="sidebar-info"><ShieldCheck size={18} />
          <span><strong>内网运行模式</strong><small>仅供受控网络访问</small></span></div>
      </div>
    </aside>

    <div className="main-frame">
      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu size={20} /></button>
          <span className="topbar-path">实验数据管理</span>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="topbar-current">运行参数工作台</span>
        </div>
        <div className="topbar-right">
          <span className="connection-badge"><span className="status-dot" />数据已连接</span>
          <div className="topbar-user"><FlaskConical size={17} /><span>实验工作台</span></div>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/records" element={<Records />} />
          <Route path="/records/new" element={<ShotEditor />} />
          <Route path="/records/:id/edit" element={<ShotEditor />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <footer className="site-footer"><span>回旋管运行参数记录系统</span><span>实验数据独立存储 · 可检索 · 可追溯</span></footer>
      </main>
    </div>
  </div>;
}

function PageTitle({ eyebrow, title, subtitle, action }: {
  eyebrow: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return <div className="page-heading">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>
    {action && <div className="page-heading-action">{action}</div>}
  </div>;
}

function Dashboard() {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  if (query.isPending) return <Spinner label="正在读取实验数据..." />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const cards = [
    { icon: Database, label: "累计炮次记录", value: formatNumber(data.shots), foot: "已保存的运行记录", tone: "blue" },
    { icon: Layers3, label: "回旋管序列", value: formatNumber(data.serials), foot: "不同序列号数量", tone: "violet" },
    { icon: SlidersHorizontal, label: "自定义参数总数", value: formatNumber(data.parameters), foot: "每炮独立参数", tone: "amber" },
    { icon: CalendarDays, label: "最近实验日期", value: data.latest_date || "暂无记录", foot: "数据库最新日期", tone: "green" },
  ];

  return <>
    <section className="hero">
      <div className="hero-content">
        <div className="hero-kicker"><Sparkles size={15} />实验数据 · 一站式管理</div>
        <h1>每一次实验，<br /><span>都值得被准确记录。</span></h1>
        <p>从固定运行参数到个性化测量项，统一管理回旋管实验全过程，让数据整理更简单。</p>
        <div className="hero-actions">
          <Link to="/records/new" className="btn btn-hero"><Plus size={18} />录入新炮次</Link>
          <Link to="/records" className="btn btn-hero-outline">查看全部记录 <ArrowRight size={17} /></Link>
        </div>
      </div>
      <div className="hero-orbits" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
        <div className="orbit-center"><Activity size={45} strokeWidth={1.5} /></div>
        <div className="orbit-indicator indicator-one" /><div className="orbit-indicator indicator-two" />
      </div>
    </section>

    <div className="section-caption"><div><span className="eyebrow">数据统计</span><h2>实验数据总览</h2><p>实时汇总，直观掌握记录情况</p></div>
      <span className="updated-label"><span className="status-dot" />实时数据库</span></div>
    <section className="stat-grid" aria-label="数据统计">
      {cards.map(({ icon: Icon, label, value, foot, tone }) =>
        <div className="stat-card" key={label}>
          <span className={"stat-icon icon-" + tone}><Icon size={20} /></span>
          <div className="stat-label">{label}</div>
          <div className={"stat-number " + (label === "最近实验日期" ? "stat-number-date" : "")}>{value}</div>
          <div className="stat-foot"><ArrowDownRight size={14} />{foot}</div>
        </div>)}
    </section>
    <section className="dashboard-grid">
      <div className="panel chart-panel">
        <div className="panel-head"><div><span className="eyebrow">分布统计</span><h2>回旋管炮次分布</h2><p>记录数最多的八个序列号</p></div><span className="panel-tag"><BarChart3 size={14} />数量统计</span></div>
        {data.by_serial.length > 0
          ? <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_serial} margin={{ top: 12, right: 15, left: -20, bottom: 5 }}>
                <CartesianGrid stroke="#eef1f7" strokeDasharray="4 5" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8490a6", fontSize: 11 }}
                  axisLine={false} tickLine={false} tickFormatter={(s: string) => s.replace("TEST-SYNTH-GYRO-", "测试")} />
                <YAxis allowDecimals={false} tick={{ fill: "#9ba7ba", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f1f5ff" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5eaf4", fontSize: 12 }}
                  formatter={(value) => [value, "炮次数"]} />
                <Bar dataKey="count" name="炮次数" fill="#5578e5" radius={[6, 6, 0, 0]} maxBarSize={39} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          : <div className="empty-small">暂无可供统计的数据</div>}
      </div>
      <div className="panel recent-panel">
        <div className="panel-head"><div><span className="eyebrow">最新活动</span><h2>最近录入的炮次</h2><p>随时继续编辑历史记录</p></div><Link to="/records" className="text-action">查看全部 <ArrowRight size={15} /></Link></div>
        <div className="recent-list">{data.recent.length ? data.recent.map((shot) =>
          <Link to={`/records/${shot.id}/edit`} className="recent-item" key={shot.id}>
            <span className="recent-icon"><Gauge size={19} /></span>
            <span className="recent-details"><strong>{shot.Serial}</strong><small>炮号 {shot.shot}</small></span>
            <span className="recent-date">{formatDate(shot.date)}</span><ChevronRight size={16} className="text-slate-400" />
          </Link>) : <div className="empty-small">暂无记录，点击“录入新炮次”开始。</div>}</div>
      </div>
    </section>
    <div className="notice"><ShieldCheck size={17} /><span>本系统采用无登录模式，请仅通过授权内网或 SSH 隧道访问。模拟测试数据不代表真实实验测量结果。</span></div>
  </>;
}

function Records() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("search") || "";
  const [draftSearch, setDraftSearch] = useState(search);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["shots", page, search], queryFn: () => api.list(page, search) });
  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["shots"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  useEffect(() => setDraftSearch(search), [search]);
  function changeParams(newPage: number, newSearch = search) {
    setParams({ ...(newSearch ? { search: newSearch } : {}), page: String(newPage) });
  }
  async function onDelete(shot: Shot) {
    if (!window.confirm(`确定删除“${shot.Serial} / ${shot.shot}”吗？\n本炮次的自定义参数也会一起删除，此操作不能撤销。`)) return;
    try {
      await remove.mutateAsync(shot.id);
    } catch { /* Error message displayed below. */ }
  }
  const totalPages = Math.max(1, Math.ceil((query.data?.total || 0) / 20));

  return <>
    <PageTitle eyebrow="数据管理 / 炮次记录" title="炮次记录"
      subtitle="查找、检查和管理每一炮的运行参数"
      action={<Link className="btn btn-primary" to="/records/new"><Plus size={18} />新增炮次</Link>} />
    <div className="records-toolbar">
      <form role="search" onSubmit={(event) => { event.preventDefault(); changeParams(1, draftSearch.trim()); }} className="search-form">
        <Search size={17} /><input aria-label="搜索回旋管序列号" placeholder="搜索回旋管序列号..." value={draftSearch} onChange={e => setDraftSearch(e.target.value)} />
        {draftSearch && <button type="button" aria-label="清除搜索" onClick={() => { setDraftSearch(""); changeParams(1, ""); }}><X size={16} /></button>}
        <button className="btn btn-primary" type="submit">搜索</button>
      </form>
      <div className="records-toolbar-right"><span><SlidersHorizontal size={16} />每页 20 条</span>
        <button aria-label="刷新数据" className="icon-button" onClick={() => void query.refetch()}><RefreshCw size={17} /></button></div>
    </div>
    {remove.isError && <div className="form-error" role="alert">{errorMessage(remove.error)}</div>}
    <div className="table-panel">
      <div className="table-heading"><span><Database size={18} />实验记录列表</span><small>共 {formatNumber(query.data?.total || 0)} 条记录</small></div>
      {query.isPending ? <Spinner /> : query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> :
        query.data.items.length === 0 ? <div className="empty-small">没有找到符合条件的炮次记录。</div> :
        <div className="table-scroll"><table className="records-table">
          <thead><tr><th>回旋管序列号</th><th>炮号</th><th>实验日期</th><th>脉宽 (ms)</th><th>阴极电压 (kV)</th><th>阴极电流 (A)</th><th>磁场电流 (A)</th><th>操作</th></tr></thead>
          <tbody>{query.data.items.map((shot) =>
            <tr key={shot.id}>
              <td><span className="serial-pill"><span className="serial-dot" />{shot.Serial}</span></td>
              <td className="number-cell">{shot.shot}</td><td>{formatDate(shot.date)}</td>
              <td className="number-cell">{shot.iplen ?? "—"}</td><td className="number-cell">{shot.Uc ?? "—"}</td>
              <td className="number-cell">{shot.Ib ?? "—"}</td><td className="number-cell">{shot.Im ?? "—"}</td>
              <td><div className="row-actions"><Link title="编辑炮次" aria-label={`编辑 ${shot.Serial} 第 ${shot.shot} 炮`} to={`/records/${shot.id}/edit`} className="row-action"><Pencil size={16} /></Link>
                <button title="删除炮次" aria-label={`删除 ${shot.Serial} 第 ${shot.shot} 炮`} className="row-action row-action-danger" onClick={() => void onDelete(shot)} disabled={remove.isPending}><Trash2 size={16} /></button></div></td>
            </tr>)}</tbody>
        </table></div>}
      <div className="table-pagination"><span>第 {page} / {totalPages} 页</span>
        <div><button disabled={page <= 1} aria-label="上一页" onClick={() => changeParams(page - 1)}><ChevronLeft size={17} />上一页</button>
          <button disabled={page >= totalPages} aria-label="下一页" onClick={() => changeParams(page + 1)}>下一页<ChevronRight size={17} /></button></div>
      </div>
    </div>
  </>;
}

const groups = ["脉冲与电压", "电流与磁场", "功率监测"];

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return <label className="field"><span className="field-label">{label}{required && <b> *</b>}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function ShotEditor() {
  const { id } = useParams();
  const recordId = id ? Number(id) : undefined;
  const editMode = recordId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form, setForm] = useState<ShotForm>(blankShot);
  const [failure, setFailure] = useState("");
  const detail = useQuery({
    queryKey: ["shot", recordId],
    queryFn: () => api.get(recordId!),
    enabled: editMode && Number.isInteger(recordId) && recordId! > 0,
  });
  useEffect(() => {
    if (detail.data && editMode) {
      const { id: unusedId, ...rest } = detail.data;
      void unusedId;
      setForm({ ...rest, custom_parameters: detail.data.custom_parameters || [] });
    }
  }, [detail.data, editMode]);
  const save = useMutation({
    mutationFn: (shot: ShotForm) =>
      editMode ? api.update(recordId!, shot) : api.create(shot),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["shots"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
        client.invalidateQueries({ queryKey: ["shot", recordId] }),
      ]);
      navigate("/records");
    },
  });
  function updateField(key: keyof ShotForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }
  function updateParameter(index: number, key: keyof CustomParameter, value: string) {
    setForm(prev => ({
      ...prev,
      custom_parameters: (prev.custom_parameters || []).map((item, i) => i === index
        ? { ...item, [key]: value } : item),
    }));
  }
  function removeParameter(index: number) {
    setForm(prev => ({ ...prev, custom_parameters: (prev.custom_parameters || []).filter((_, i) => i !== index) }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure("");
    if (!form.Serial.trim() || !form.shot.trim()) {
      setFailure("请填写回旋管序列号和炮号");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      await save.mutateAsync({
        ...form,
        Serial: form.Serial.trim(),
        shot: form.shot.trim(),
        custom_parameters: (form.custom_parameters || []).map(p => ({
          ...p, name: p.name.trim(), description: p.description.trim(),
        })),
      });
    } catch (error) {
      setFailure(errorMessage(error));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (editMode && (!Number.isInteger(recordId) || recordId! <= 0))
    return <div className="error-state">炮次编号无效</div>;
  if (editMode && detail.isPending) return <Spinner label="正在加载历史炮次..." />;
  if (editMode && detail.isError) return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;

  return <>
    <PageTitle eyebrow={editMode ? "记录管理 / 编辑历史炮次" : "记录管理 / 新建炮次"}
      title={editMode ? "编辑炮次记录" : "新增炮次记录"} subtitle={editMode
        ? "修改当前炮次的运行信息和独立自定义参数"
        : "填写本次实验数据，保存后即可检索和编辑"}
      action={<Link className="btn btn-secondary" to="/records"><ArrowLeft size={16} />返回列表</Link>} />
    {failure && <div role="alert" className="form-error"><CircleHelp size={17} />{failure}</div>}
    <form onSubmit={event => void submit(event)} className="editor-layout">
      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-blue"><Layers3 size={20} /></span>
          <div><h2>炮次基本信息</h2><p>回旋管序列号与炮号共同标识一次实验</p></div><span className="section-step">01 / 04</span></div>
        <div className="field-grid field-grid-three">
          <Field label="回旋管序列号" required><input maxLength={120} required placeholder="例如：GYRO-001" value={form.Serial} onChange={e => updateField("Serial", e.target.value)} /></Field>
          <Field label="炮号" required><input required inputMode="numeric" placeholder="请输入整数炮号" value={form.shot} onChange={e => updateField("shot", e.target.value)} /></Field>
          <Field label="实验日期"><input type="date" value={form.date || ""} onChange={e => updateField("date", e.target.value)} /></Field>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-violet"><Gauge size={20} /></span>
          <div><h2>固定运行参数</h2><p>按实验测量值填写，未测量的字段可以留空</p></div><span className="section-step">02 / 04</span></div>
        {groups.map(group =>
          <div className="parameter-group" key={group}>
            <div className="parameter-group-title"><span className="group-mark" />{group}</div>
            <div className="field-grid field-grid-three">
              {FIXED_FIELDS.filter(field => field.group === group).map(field =>
                <Field key={field.key} label={field.label} hint={field.unit}>
                  <input inputMode="decimal" placeholder="请输入测量值" value={form[field.key] || ""}
                    onChange={e => updateField(field.key as FixedKey, e.target.value)} />
                </Field>)}
            </div>
          </div>)}
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-orange"><SlidersHorizontal size={20} /></span>
          <div><h2>自定义参数</h2><p>每炮独立设置，不自动继承前一炮的参数</p></div>
          <span className="section-step">03 / 04</span></div>
        <div className="custom-params">
          {(form.custom_parameters || []).length ? form.custom_parameters!.map((parameter, index) =>
            <div className="custom-card" key={parameter.id !== undefined ? "id-" + parameter.id : "new-" + index}>
              <div className="custom-card-head"><span className="custom-index">参数 {String(index + 1).padStart(2, "0")}</span>
                <button type="button" className="remove-custom" onClick={() => removeParameter(index)}><Trash2 size={15} />删除参数</button></div>
              <div className="field-grid field-grid-five">
                <Field label="参数名称" required><input maxLength={120} placeholder="例如：It" required value={parameter.name} onChange={e => updateParameter(index, "name", e.target.value)} /></Field>
                <Field label="中文含义" required><input maxLength={255} placeholder="例如：钛泵电流" required value={parameter.description} onChange={e => updateParameter(index, "description", e.target.value)} /></Field>
                <Field label="单位"><input maxLength={60} placeholder="例如：mA" value={parameter.unit || ""} onChange={e => updateParameter(index, "unit", e.target.value)} /></Field>
                <Field label="数据类型"><select value={parameter.data_type} onChange={e => updateParameter(index, "data_type", e.target.value)}>
                  {PARAMETER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></Field>
                <Field label="参数值">
                  {parameter.data_type === "TEXT"
                    ? <textarea rows={2} placeholder="请输入文本内容" value={parameter.value || ""} onChange={e => updateParameter(index, "value", e.target.value)} />
                    : <input type={parameter.data_type === "DATE" ? "date" : "text"}
                      inputMode={parameter.data_type === "DECIMAL" ? "decimal" : parameter.data_type === "BIGINT" ? "numeric" : "text"}
                      placeholder="参数值" value={parameter.value || ""} onChange={e => updateParameter(index, "value", e.target.value)} />}
                </Field>
              </div>
            </div>) : <div className="custom-empty"><SlidersHorizontal size={22} /><span>本炮次尚未设置自定义参数</span><small>需要记录额外测量项时，可自由添加</small></div>}
        </div>
        <button type="button" className="add-parameter" onClick={() => setForm(prev => ({
          ...prev, custom_parameters: [...(prev.custom_parameters || []), blankParameter()],
        }))}><Plus size={17} />添加自定义参数</button>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-green"><Pencil size={19} /></span>
          <div><h2>实验备注</h2><p>补充实验条件、观察结果和其他说明</p></div><span className="section-step">04 / 04</span></div>
        <Field label="备注内容"><textarea rows={4} className="notes-textarea" placeholder="记录本次实验的补充信息..." value={form.remark || ""} onChange={e => updateField("remark", e.target.value)} /></Field>
      </section>
      <div className="editor-actions"><span><ShieldCheck size={17} />保存后数据将存入 PostgreSQL</span>
        <div><Link className="btn btn-secondary" to="/records">取消</Link><button className="btn btn-primary" type="submit" disabled={save.isPending}>
          {save.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={18} />}
          {save.isPending ? "正在保存..." : "保存炮次记录"}</button></div></div>
    </form>
  </>;
}

function NotFound() {
  return <div className="error-state"><CircleHelp size={35} /><h2>页面不存在</h2><p>你访问的页面可能已移动。</p><Link className="btn btn-primary" to="/">返回数据概览<ArrowRight size={17} /></Link></div>;
}

export default Shell;
