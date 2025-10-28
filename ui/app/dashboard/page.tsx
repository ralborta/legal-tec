"use client";
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Gavel, BookOpen, CheckCircle2, Clock3, Users, Settings, Upload, Send, Download, ExternalLink, Trash2, Filter, Plus, History, Sparkles, Loader2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";

/**
 * UI – Legal Agents (Centro de Gestión) – Next.js Client Component
 *
 * ✔️ Single-file listo para pegar en /app/dashboard/page.tsx (App Router)
 *    - Requiere Tailwind y lucide-react instalados
 * ✔️ Conecta a tu API: process.env.NEXT_PUBLIC_API_URL (Railway)
 * ✔️ Genera documentos vía POST /v1/generate y los muestra al instante
 * ✔️ Vista de Bandeja (local) + KPIs mock + Preview Markdown + Citations
 *
 * Para producción, separá en componentes y agrega fetch a /v1/documents cuando lo tengas.
 */

const kpis = [
  { title: "Solicitudes en Cola", value: "7", caption: "Pendientes", icon: Clock3, color: "text-amber-600" },
  { title: "Docs Generados (7d)", value: "126", caption: "+18% vs prev.", icon: FileText, color: "text-emerald-600" },
  { title: "Exactitud de Citas", value: "96.2%", caption: "últ. 100 docs", icon: CheckCircle2, color: "text-emerald-600" },
  { title: "Latencia Media", value: "1.8m", caption: "p95: 3.2m", icon: Loader2, color: "text-slate-600" },
  { title: "Fuentes Conectadas", value: "4", caption: "BO, vLex, MicroJuris, Internas", icon: BookOpen, color: "text-slate-600" },
  { title: "Usuarios Activos", value: "12", caption: "WNS & Asociados", icon: Users, color: "text-slate-600" },
];

export default function CentroGestionLegalPage() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushItem = (entry: any) => setItems((prev) => [entry, ...prev]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <Topbar />
          <main className="px-4 sm:px-6 lg:px-8 pb-10">
            <div className="pt-4">
              <h1 className="text-2xl font-semibold">Centro de Gestión</h1>
              <p className="text-slate-500">Operación de agentes jurídicos · WNS & Asociados</p>

              <KPIGrid />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                <div className="lg:col-span-2"><BandejaLocal items={items} /></div>
                <div className="lg:col-span-1">
                  <GenerarPanel
                    onGenerated={(out) => {
                      pushItem({
                        id: crypto.randomUUID(),
                        tipo: out.type.toUpperCase(),
                        asunto: out.title,
                        estado: "Listo para revisión",
                        prioridad: "Media",
                        creado: new Date().toLocaleTimeString(),
                        agente: "Orquestador",
                        markdown: out.markdown,
                        citations: out.citations as any[]
                      });
                    }}
                    setError={setError}
                    setLoading={setLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-3 text-sm">{error}</div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Estilos auxiliares */}
      <style jsx global>{`
        .icon-btn { @apply rounded-xl border bg-white p-2 hover:bg-slate-50 text-slate-600; }
        .input { @apply rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10; }
        .select { @apply rounded-xl border bg-white px-3 py-2 text-sm; }
        .textarea { @apply rounded-xl border bg-white px-3 py-2 text-sm; }
        .btn { @apply inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800; }
        .btn-secondary { @apply rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50; }
      `}</style>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden lg:flex w-72 shrink-0 border-r bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center gap-2 px-4 h-16 border-b">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold">IA</div>
          <div className="leading-tight">
            <p className="text-sm text-slate-500">Centro de Gestión</p>
            <p className="font-semibold">Legal Agents</p>
          </div>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="w-full rounded-xl border bg-white pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10" placeholder="Buscar solicitud o documento…" />
          </div>
        </div>
        <nav className="px-2 space-y-1 overflow-y-auto pb-6">
          <SideLink icon={Sparkles} label="Bandeja" active />
          <SideLink icon={Plus} label="Generar" />
          <SideLink icon={History} label="Historial" />
          <section>
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">Fuentes</div>
            <SideLink className="ml-7" icon={BookOpen} label="Normativa" />
            <SideLink className="ml-7" icon={Gavel} label="Jurisprudencia" />
          </section>
          <SideLink icon={CheckCircle2} label="Calidad" />
          <SideLink icon={Settings} label="Configuración" />
        </nav>
      </div>
    </aside>
  );
}

function SideLink({ icon: Icon, label, active, className = "" }: any) {
  return (
    <a className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 ${active ? "bg-slate-900 text-white hover:bg-slate-900" : "text-slate-700"} ${className}`} href="#">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </a>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-1">Estado: Operativo</div>
        </div>
        <div className="flex-1 max-w-xl hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="w-full rounded-xl border bg-white pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10" placeholder="Buscar por asunto, ID o cliente…" />
          </div>
        </div>
        <div className="text-sm text-slate-500">{new Date().toLocaleDateString()}</div>
      </div>
    </header>
  );
}

function KPIGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
      {kpis.map((k, i) => (
        <motion.div key={k.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-slate-500 text-sm">{k.title}</div>
            <k.icon className={`h-4 w-4 ${k.color}`} />
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-2xl font-semibold">{k.value}</div>
            <div className="text-xs text-slate-500">{k.caption}</div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(95, 20 + i * 12)}%` }} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BandejaLocal({ items }: { items: any[] }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-slate-700 font-medium">Bandeja de Solicitudes</div>
          <div className="text-slate-400 text-sm">Documentos generados en esta sesión</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="icon-btn"><Filter className="h-4 w-4" /></button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">Aún no hay documentos. Generá uno desde la derecha.</div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <DocCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocCard({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-slate-700 font-medium">{row.asunto}</div>
          <div className="text-slate-400 text-xs">{row.tipo} · {row.estado} · {row.creado}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="icon-btn" title="Ver" onClick={() => setOpen(v=>!v)}><Eye className="h-4 w-4" /></button>
          <button className="icon-btn" title="Descargar Markdown" onClick={()=>downloadMD(row.asunto, row.markdown)}><Download className="h-4 w-4" /></button>
          <button className="icon-btn" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border bg-slate-50 p-3 max-h-[380px] overflow-auto markdown-content">
            <ReactMarkdown>{row.markdown}</ReactMarkdown>
          </div>
          <div className="lg:col-span-1 rounded-xl border p-3">
            <div className="text-sm font-medium text-slate-700 mb-2">Citas</div>
            <ul className="space-y-2 text-sm">
              {(row.citations || []).map((c:any, i:number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                  <div>
                    <div className="text-slate-700">{c.title || "(sin título)"}</div>
                    <div className="text-slate-500 text-xs">{c.source || "fuente"} · {c.url ? <a className="underline" href={c.url} target="_blank" rel="noreferrer">link</a> : "s/link"}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadMD(filename: string, md: string) {
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${sanitize(filename)}.md`; a.click();
  URL.revokeObjectURL(url);
}
function sanitize(s: string) { return s.replace(/[^a-z0-9\-\_\ ]/gi, "_"); }

function GenerarPanel({ onGenerated, setError, setLoading }: { onGenerated: (out: any)=>void; setError: (e:string|null)=>void; setLoading: (b:boolean)=>void; }) {
  const [type, setType] = useState<"dictamen"|"contrato"|"memo"|"escrito">("dictamen");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const API = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "", []);

  async function handleSubmit() {
    setError(null); setLoading(true);
    try {
      if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");
      const r = await fetch(`${API}/v1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, instructions })
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      onGenerated({ type, title, ...data });
      setTitle(""); setInstructions("");
    } catch (e:any) {
      setError(e.message || "Error al generar");
    } finally { setLoading(false); }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-slate-700 font-medium mb-1">Generar Documento</div>
      <div className="text-slate-400 text-sm mb-4">Orquesta agentes Normativo + Jurisprudencial</div>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Tipo de documento</label>
        <select className="select w-full" value={type} onChange={e=>setType(e.target.value as any)}>
          <option value="dictamen">Dictamen</option>
          <option value="contrato">Contrato</option>
          <option value="memo">Memo</option>
          <option value="escrito">Escrito</option>
        </select>
        <label className="block text-sm font-medium text-slate-700">Título</label>
        <input className="input w-full" placeholder="Ej.: Aplicación del art. 765 CCyC en mutuo USD" value={title} onChange={e=>setTitle(e.target.value)} />
        <label className="block text-sm font-medium text-slate-700">Instrucciones</label>
        <textarea className="textarea w-full h-28" placeholder="Hechos, contexto, puntos a resolver, tono, jurisdicción…" value={instructions} onChange={e=>setInstructions(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Adjuntos (próximamente)</label>
          <div className="rounded-xl border border-dashed p-6 text-center text-slate-500">
            <Upload className="h-5 w-5 mx-auto mb-2" />
            Arrastrá PDFs o hacé click para subir
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={handleSubmit}><Send className="h-4 w-4" /> Generar</button>
          <button className="btn-secondary" onClick={()=>{ setTitle(""); setInstructions(""); }}>Limpiar</button>
        </div>
      </div>
    </div>
  );
}

