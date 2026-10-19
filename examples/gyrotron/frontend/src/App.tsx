import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowLeft, ArrowRight, Check, CircleHelp, Gauge, Layers3,
  LoaderCircle, Pencil, Plus, SlidersHorizontal, Trash2, ShieldCheck, RefreshCw
} from "lucide-react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api";
import DashboardV11 from "./DashboardV11";
import RecordsV11 from "./RecordsV11";
import {
  FIXED_FIELDS, PARAMETER_TYPES, blankParameter, blankShot,
  type CustomParameter, type FixedKey, type ShotForm,
} from "./types";

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
  return <div className="app-shell v11-shell">
    <div className="main-frame">
      <header className="v11-topbar">
        <Link to="/" className="v11-brand"><Activity size={22} /><strong>回旋管实验记录</strong></Link>
        <nav aria-label="主导航"><NavLink to="/" end>工作台</NavLink><NavLink to="/records">实验记录</NavLink></nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardV11 />} />
          <Route path="/records" element={<RecordsV11 />} />
          <Route path="/records/new" element={<ShotEditor />} />
          <Route path="/records/:id/edit" element={<ShotEditor />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  </div>;
}

function PageTitle({ action, title }: {
  eyebrow: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return <div className="page-heading">
    <div><h1>{title}</h1></div>
    {action && <div className="page-heading-action">{action}</div>}
  </div>;
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
  const [urlParams] = useSearchParams();
  const client = useQueryClient();
  const nextSave = useRef(false);
  const shotTouched = useRef(false);
  const preparingNext = useRef(false);
  const initialized = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<ShotForm>(blankShot);
  const nextNumber = useQuery({
    queryKey: ["next-shot", form.Serial],
    queryFn: () => api.nextShot(form.Serial),
    enabled: !editMode && Boolean(form.Serial.trim()),
  });
  const suggestions = useQuery({
    queryKey: ["suggestions", form.Serial],
    queryFn: () => api.suggestions(form.Serial),
    enabled: Boolean(form.Serial.trim()),
  });
  useEffect(() => {
    if (editMode || initialized.current) return;
    initialized.current = true;
    const old = localStorage.getItem("gyrotron-shot-draft-new");
    if (old) {
      try {
        const parsed = JSON.parse(old) as ShotForm;
        if (window.confirm("检测到上次未提交的炮次草稿。要恢复吗？")) {
          setForm(parsed);
          return;
        }
      } catch { /* Invalid local drafts should not stop editing. */ }
    }
    const currentSerial = urlParams.get("serial") || localStorage.getItem("gyrotron-current-serial") || "";
    if (currentSerial) setForm(prev => ({...prev, Serial: currentSerial}));
  }, [editMode, urlParams]);
  useEffect(() => {
    if (!editMode && !shotTouched.current && !preparingNext.current && !form.shot && nextNumber.data?.shot) {
      setForm(prev => prev.shot || shotTouched.current ? prev : { ...prev, shot: nextNumber.data!.shot });
    }
  }, [editMode, nextNumber.data, form.shot]);
  useEffect(() => {
    if (!editMode && initialized.current && dirty) {
      localStorage.setItem("gyrotron-shot-draft-new", JSON.stringify(form));
    }
  }, [editMode, form, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
    onSuccess: async (saved) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["shots"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
        client.invalidateQueries({ queryKey: ["shot", recordId] }),
        client.invalidateQueries({ queryKey: ["next-shot"] }),
        client.invalidateQueries({ queryKey: ["serials"] }),
      ]);
      setDirty(false);
      localStorage.removeItem("gyrotron-shot-draft-new");
      if (!editMode && nextSave.current) {
        nextSave.current = false;
        preparingNext.current = true;
        shotTouched.current = false;
        setForm({ ...blankShot(), Serial: saved.Serial, shot: "" });
        try {
          const suggested = await api.nextShot(saved.Serial);
          if (!shotTouched.current) {
            setForm(prev => prev.shot ? prev : { ...prev, shot: suggested.shot });
          }
        } catch { /* User can supply shot manually when suggestions unavailable. */ }
        finally { preparingNext.current = false; }
      } else {
        navigate("/records?serial=" + encodeURIComponent(saved.Serial));
      }
    },
  });
  function updateField(key: keyof ShotForm, value: string) {
    if (key === "shot") shotTouched.current = true;
    if (key === "Serial" && !editMode) shotTouched.current = false;
    setDirty(true);
    setForm(prev => ({ ...prev, [key]: value, ...(key === "Serial" && !editMode ? { shot: "" } : {}) }));
  }
  function updateParameter(index: number, key: keyof CustomParameter, value: string) {
    setDirty(true);
    const suggested = key === "name" ? suggestions.data?.find(p => p.name === value) : undefined;
    setForm(prev => ({
      ...prev,
      custom_parameters: (prev.custom_parameters || []).map((item, i) => i === index
        ? { ...item, [key]: value,
            ...(suggested ? { description: item.description || suggested.description || "",
                unit: item.unit || suggested.unit || "", data_type: suggested.data_type as CustomParameter["data_type"] } : {}) } : item),
    }));
  }
  function removeParameter(index: number) {
    setDirty(true);
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
          ...p, name: p.name.trim(), description: (p.description || "").trim(),
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
      title={editMode ? "编辑实验记录" : "新增实验记录"} subtitle={editMode
        ? "修改当前炮次的运行信息和独立自定义参数"
        : "填写本次实验数据，保存后即可检索和编辑"}
      action={<Link className="btn btn-secondary" to="/records"><ArrowLeft size={16} />返回列表</Link>} />
    {failure && <div role="alert" className="form-error"><CircleHelp size={17} />{failure}</div>}
    <form onSubmit={event => void submit(event)} className="editor-layout">
      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-blue"><Layers3 size={20} /></span>
          <div><h2>炮次基本信息</h2></div><span className="section-step">01 / 04</span></div>
        <div className="field-grid field-grid-three">
          <Field label="回旋管序列号" required><input disabled={editMode} maxLength={120} required placeholder="例如：GYRO-001" value={form.Serial} onChange={e => updateField("Serial", e.target.value)} /></Field>
          <Field label="炮号" required><input disabled={editMode} required inputMode="numeric" placeholder="请输入整数炮号" value={form.shot} onFocus={() => { shotTouched.current = true; }} onChange={e => updateField("shot", e.target.value)} /></Field>
          <Field label="实验日期" required><input required type="date" value={form.date || ""} onChange={e => updateField("date", e.target.value)} /></Field>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-violet"><Gauge size={20} /></span>
          <div><h2>固定运行参数</h2></div><span className="section-step">02 / 04</span></div>
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
          <div><h2>自定义参数</h2></div>
          <span className="section-step">03 / 04</span></div>
        <div className="custom-params">
          {(form.custom_parameters || []).length ? form.custom_parameters!.map((parameter, index) =>
            <div className="custom-card" key={parameter.id !== undefined ? "id-" + parameter.id : "new-" + index}>
              <div className="custom-card-head"><span className="custom-index">参数 {String(index + 1).padStart(2, "0")}</span>
                <button type="button" className="remove-custom" onClick={() => removeParameter(index)}><Trash2 size={15} />删除参数</button></div>
              <div className="field-grid field-grid-five">
                <Field label="参数名称" required><input list="gyrotron-param-names" maxLength={120} placeholder="例如：It" required value={parameter.name} onChange={e => updateParameter(index, "name", e.target.value)} /></Field>
                <Field label="参数含义"><input maxLength={255} placeholder="例如：钛泵电流（可留空）" value={parameter.description} onChange={e => updateParameter(index, "description", e.target.value)} /></Field>
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
            </div>) : <div className="custom-empty"><SlidersHorizontal size={22} /><span>本炮次尚未设置自定义参数</span></div>}
        </div>
        <datalist id="gyrotron-param-names">{suggestions.data?.map(p => <option key={p.name} value={p.name}>{p.source} · {p.description || ""}</option>)}</datalist>
        <button type="button" className="add-parameter" onClick={() => { setDirty(true); setForm(prev => ({
          ...prev, custom_parameters: [...(prev.custom_parameters || []), blankParameter()],
        })); }}><Plus size={17} />添加自定义参数</button>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="section-icon section-green"><Pencil size={19} /></span>
          <div><h2>实验备注</h2></div><span className="section-step">04 / 04</span></div>
        <Field label="备注内容"><textarea rows={4} className="notes-textarea" placeholder="记录本次实验的补充信息..." value={form.remark || ""} onChange={e => updateField("remark", e.target.value)} /></Field>
      </section>
      <div className="editor-actions"><span><ShieldCheck size={17} />保存后数据将存入 PostgreSQL</span>
        <div><Link className="btn btn-secondary" to="/records" onClick={event => {
            if (dirty && !window.confirm("存在未保存的修改，要放弃吗？")) event.preventDefault();
          }}>取消</Link><button className="btn btn-primary" type="submit" onClick={() => { nextSave.current = false; }} disabled={save.isPending}>
          {save.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={18} />}
          {save.isPending ? "正在保存..." : "保存并返回列表"}</button>
          {!editMode && <button className="btn btn-secondary" type="submit" onClick={() => { nextSave.current = true; }} disabled={save.isPending}>
            保存并录入下一炮</button>}</div></div>
    </form>
  </>;
}

function NotFound() {
  return <div className="error-state"><CircleHelp size={35} /><h2>页面不存在</h2><p>你访问的页面可能已移动。</p><Link className="btn btn-primary" to="/">返回数据概览<ArrowRight size={17} /></Link></div>;
}

export default Shell;
