"use client";
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Gavel, BookOpen, CheckCircle2, Clock3, Users, Settings, Upload, Send, Download, ExternalLink, Trash2, Filter, Plus, History, Sparkles, Loader2, Eye, X, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";

/**
 * UI – Legal Agents (Centro de Gestión) – Next.js Client Component
 * Dashboard principal en la raíz (/)
 */

// Helper para normalizar URL de API
function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || "";
  // Remover barra final si existe para evitar URLs como https://api.com//v1/generate
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const kpis = [
  { title: "Solicitudes en Cola", value: "7", caption: "Pendientes", icon: Clock3, color: "text-amber-600" },
  { title: "Docs Generados (7d)", value: "126", caption: "+18% vs prev.", icon: FileText, color: "text-emerald-600" },
  { title: "Exactitud de Citas", value: "96.2%", caption: "últ. 100 docs", icon: CheckCircle2, color: "text-emerald-600" },
  { title: "Latencia Media", value: "1.8m", caption: "p95: 3.2m", icon: Loader2, color: "text-slate-600" },
  { title: "Fuentes Conectadas", value: "4", caption: "BQ, vLex, MicroJuris, Internas", icon: BookOpen, color: "text-slate-600" },
  { title: "Usuarios Activos", value: "12", caption: "WNS & Asociados", icon: Users, color: "text-slate-600" },
];

export default function CentroGestionLegalPage() {
  const [items, setItems] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushItem = (entry: any) => setItems((prev) => [entry, ...prev]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <div className="flex">
        <Sidebar />
        <div className="flex-1 min-w-0 bg-white">
          <Topbar />
          <main className="px-4 sm:px-6 lg:px-8 pb-10 bg-white">
            <div className="pt-6">
              <h1 className="text-2xl font-bold text-slate-900">Centro de Gestión</h1>
              <p className="text-slate-600 mt-1">Operación de agentes jurídicos · WNS & Asociados</p>

              <KPIGrid />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                <div className="lg:col-span-2 min-w-0"><BandejaLocal items={items} /></div>
                <div className="lg:col-span-1">
                  <GenerarPanel
                    onGenerated={(out) => {
                      pushItem({
                        id: out.documentId || crypto.randomUUID(),
                        tipo: out.type.toUpperCase(),
                        asunto: out.title,
                        estado: "Listo para revisión",
                        prioridad: "Media",
                        creado: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
                                 new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
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
        .icon-btn { @apply rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 text-slate-600 transition-colors; }
        .input { @apply rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400; }
        .select { @apply rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm; }
        .textarea { @apply rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm placeholder:text-slate-400; }
        .btn { @apply inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition-colors font-medium; }
        .btn-secondary { @apply rounded-lg border border-slate-300 bg-white text-slate-700 px-4 py-2 text-sm hover:bg-slate-50 transition-colors; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 { @apply text-slate-900 font-bold; }
        .markdown-content p { @apply text-slate-700; }
        .markdown-content ul, .markdown-content ol { @apply text-slate-700; }
        .markdown-content code { @apply bg-slate-100 text-slate-800 px-1 rounded; }
        .markdown-content pre { @apply bg-slate-50 border border-slate-200 p-3 rounded; }
        .markdown-content a { @apply text-blue-600 hover:text-blue-700; }
      `}</style>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden lg:flex w-72 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200">
          <div className="h-10 w-10 rounded-lg bg-blue-600 text-white grid place-items-center font-bold text-sm">IA</div>
          <div className="leading-tight">
            <p className="text-xs text-slate-500 font-medium">Centro de Gestión</p>
            <p className="text-sm font-semibold text-slate-900">Legal Agents</p>
          </div>
        </div>
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400" placeholder="Buscar solicitud o documento" />
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1 overflow-y-auto flex-1">
          <SideLink icon={Sparkles} label="Bandeja" active />
          <SideLink icon={Plus} label="Generar" />
          <SideLink icon={History} label="Historial" />
          <div className="pt-4 mt-4 border-t border-slate-200">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">FUENTES</div>
            <SideLink className="ml-2" icon={BookOpen} label="Normativa" />
            <SideLink className="ml-2" icon={Gavel} label="Jurisprudencia" />
          </div>
          <div className="pt-2">
            <SideLink icon={CheckCircle2} label="Calidad" />
            <SideLink icon={Settings} label="Configuración" />
          </div>
        </nav>
      </div>
    </aside>
  );
}

function SideLink({ icon: Icon, label, active, className = "" }: any) {
  return (
    <a className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-purple-600 text-white font-medium" : "text-slate-700 hover:bg-slate-50"} ${className}`} href="#">
      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-slate-500"}`} />
      <span>{label}</span>
    </a>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
      <div className="h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm text-slate-700 font-medium">Estado: Operativo</span>
          </div>
        </div>
        <div className="flex-1 max-w-xl hidden md:block mx-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400" placeholder="Buscar por asunto, ID o cliente…" />
          </div>
        </div>
        <div className="text-sm text-slate-600 font-medium">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
      </div>
    </header>
  );
}

function KPIGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
      {kpis.map((k, i) => {
        return (
          <motion.div 
            key={k.title} 
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.05 }} 
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-slate-600 text-sm font-medium">{k.title}</div>
              <k.icon className={`h-5 w-5 ${k.color}`} />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-3xl font-bold text-slate-900">{k.value}</div>
              <div className="text-xs text-slate-500 text-right whitespace-nowrap">{k.caption}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function BandejaLocal({ items }: { items: any[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-slate-900 font-semibold text-lg">Bandeja de Solicitudes</div>
          <div className="text-slate-500 text-sm mt-0.5">Documentos generados en esta sesión</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              className="rounded-lg border border-slate-300 bg-white text-slate-900 pl-9 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400 w-48" 
              placeholder="Filtrar..." 
            />
          </div>
          <button className="icon-btn"><Filter className="h-4 w-4" /></button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500 py-8 text-center">Aún no hay documentos. Generá uno desde la derecha.</div>
      ) : (
        <div className="space-y-4">
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
  const [queryMode, setQueryMode] = useState(false);
  
  // Determinar color del estado según el texto (light mode)
  const getEstadoColor = (estado: string) => {
    if (estado.toLowerCase().includes("listo") || estado.toLowerCase().includes("ready")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (estado.toLowerCase().includes("proceso") || estado.toLowerCase().includes("process")) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (estado.toLowerCase().includes("atención") || estado.toLowerCase().includes("attention") || estado.toLowerCase().includes("requiere")) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  // Formatear fecha si viene en formato diferente
  const formatFecha = (fecha: string) => {
    try {
      const date = new Date(fecha);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
               date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      }
    } catch {}
    return fecha;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getEstadoColor(row.estado)}`}>
              {row.estado}
            </span>
          </div>
          <div className="text-slate-900 font-semibold mb-1">{row.tipo}</div>
          <div className="text-slate-900 font-medium mb-1">{row.asunto}</div>
          <div className="text-slate-500 text-xs">{row.tipo} · {row.estado} · {formatFecha(row.creado || new Date().toISOString())}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button className="icon-btn" title="Ver" onClick={() => { setOpen(v=>!v); setQueryMode(false); }}><Eye className="h-4 w-4" /></button>
          <button className="icon-btn" title="Descargar Markdown" onClick={()=>downloadMD(row.asunto, row.markdown)}><Download className="h-4 w-4" /></button>
          <button className="icon-btn" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-4 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8">
          {queryMode ? (
            <QueryDocPanel documentId={row.id} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 md:p-10 max-h-[700px] overflow-auto markdown-content text-slate-700 w-full">
                <ReactMarkdown>{row.markdown}</ReactMarkdown>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-900 mb-3">Citas</div>
                {(row.citations && row.citations.length > 0) ? (
                  <ul className="space-y-2 text-sm">
                    {row.citations.map((c:any, i:number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`mt-1 h-2 w-2 rounded-full ${
                          c.source === "normativa" ? "bg-blue-500" :
                          c.source === "jurisprudencia" ? "bg-purple-500" :
                          c.source === "doctrina" ? "bg-orange-500" :
                          "bg-emerald-500"
                        }`} />
                        <div className="flex-1">
                          <div className="text-slate-900 font-medium">{c.title || "(sin título)"}</div>
                          <div className="text-slate-500 text-xs mt-0.5">
                            <span className="capitalize">{c.source || "otra"}</span>
                            {c.url && (
                              <> · <a className="underline hover:text-blue-600 text-blue-600" href={c.url} target="_blank" rel="noreferrer">ver fuente</a></>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-400 italic">No hay citas registradas</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueryDocPanel({ documentId }: { documentId: string }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  async function handleQuery() {
    if (!query.trim() || !API) return;
    setLoading(true);
    setResponse(null);
    try {
      const r = await fetch(`${API}/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, query })
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setResponse(data.response);
      setQuery("");
    } catch (e: any) {
      setResponse(`Error: ${e.message || "Error al consultar"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-900 mb-1">Consulta sobre el documento</div>
        <div className="text-xs text-slate-500">Tipo NotebookLM: pregunta o pide modificaciones</div>
      </div>
      
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ej: Explica la conclusión / Modifica la sección de análisis / ¿Qué dice sobre el incumplimiento?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleQuery()}
          disabled={loading}
        />
        <button className="btn" onClick={handleQuery} disabled={loading || !query.trim()}>
          <Send className="h-4 w-4" /> {loading ? "..." : "Enviar"}
        </button>
      </div>

      {response && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500 mb-2">Respuesta:</div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{response}</div>
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

function ProgressIndicator() {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  
  const stages = [
    "Analizando transcripción...",
    "Procesando contenido jurídico...",
    "Generando memo estructurado...",
    "Finalizando documento..."
  ];

  React.useEffect(() => {
    // Resetear cuando se monta
    setProgress(0);
    setStage(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          return prev; // Mantener cerca del 100% pero no llegar al 100% hasta que termine
        }
        return prev + Math.random() * 8 + 2;
      });
    }, 400);

    const stageInterval = setInterval(() => {
      setStage((prev) => (prev + 1) % stages.length);
    }, 2500);

    return () => {
      clearInterval(interval);
      clearInterval(stageInterval);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
          <div className="absolute inset-0 rounded-full border-2 border-blue-200 animate-ping"></div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-blue-900 mb-1">Generando documento</div>
          <div className="text-xs text-blue-700">{stages[stage]}</div>
        </div>
        <div className="text-sm font-bold text-blue-600">{Math.min(100, Math.round(progress))}%</div>
      </div>
      
      {/* Barra de progreso animada */}
      <div className="relative h-2 bg-blue-100 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500"
          initial={{ width: "0%" }}
          animate={{ width: `${Math.min(100, progress)}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          animate={{
            x: ["-100%", "200%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{ width: "50%" }}
        />
      </div>
      
      {/* Puntos animados */}
      <div className="flex gap-1 mt-3 justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-blue-500"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function GenerarPanel({ onGenerated, setError, setLoading }: { onGenerated: (out: any)=>void; setError: (e:string|null)=>void; setLoading: (b:boolean)=>void; }) {
  
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [type, setType] = useState<"dictamen"|"contrato"|"memo"|"escrito">("dictamen");
  const [areaLegal, setAreaLegal] = useState<"civil_comercial"|"laboral"|"corporativo"|"compliance"|"marcas"|"consumidor"|"traducir">("civil_comercial");
  const [file, setFile] = useState<File | null>(null);
  const [memoResult, setMemoResult] = useState<any | null>(null);
  const [useMemoEndpoint, setUseMemoEndpoint] = useState(false); // Toggle entre endpoints
  const [loadingLocal, setLoadingLocal] = useState(false); // Estado local para loading
  const API = useMemo(() => getApiUrl(), []);

  async function handleSubmit() {
    setError(null); 
    setLoadingLocal(true);
    setLoading(true); 
    setMemoResult(null);
    try {
      if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");

      // Si hay archivo PDF o se quiere usar el endpoint de memos, usar /api/memos/generate
      if (useMemoEndpoint || file) {
        const formData = new FormData();
        formData.append("tipoDocumento", type === "memo" ? "Memo de reunión" : type);
        formData.append("titulo", title);
        formData.append("instrucciones", instructions);
        formData.append("areaLegal", areaLegal); // Agregar área legal
        if (file) {
          formData.append("transcripcion", file);
        }

        const r = await fetch(`${API}/api/memos/generate`, {
          method: "POST",
          body: formData
        });

        if (!r.ok) {
          const errorText = await r.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: `Error ${r.status}: ${errorText || "Sin detalles"}` };
          }
          console.error("Error en /api/memos/generate:", r.status, errorData);
          throw new Error(errorData.error || `Error ${r.status}: ${errorText || "Method Not Allowed"}`);
        }

                    const data = await r.json();
                    setMemoResult(data);
                    // Convertir citas del memo al formato esperado por la bandeja
                    const citations = (data.citas || []).map((c: any) => ({
                      title: c.referencia || c.descripcion || "(sin título)",
                      source: c.tipo || "otra",
                      url: c.url || undefined
                    }));
                    onGenerated({ 
                      type, 
                      title, 
                      markdown: data.texto_formateado, 
                      memoData: data,
                      citations: citations // Agregar citas al formato de la bandeja
                    });
                    setTitle(""); setInstructions(""); setFile(null);
      } else {
        // Endpoint original /v1/generate (RAG con corpus)
        const r = await fetch(`${API}/v1/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, title, instructions })
        });
        if (!r.ok) {
          const errorText = await r.text();
          console.error("Error en /v1/generate:", r.status, errorText);
          throw new Error(`Error ${r.status}: ${errorText || "Method Not Allowed"}`);
        }
        const data = await r.json();
        onGenerated({ type, title, ...data });
        setTitle(""); setInstructions("");
      }
    } catch (e:any) {
      setError(e.message || "Error al generar");
    } finally { 
      setLoadingLocal(false);
      setLoading(false); 
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-900 font-semibold mb-1">Generar Documento</div>
      <div className="text-slate-500 text-sm mb-5">Orquesta agentes Normativo + Jurisprudencial</div>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Tipo de documento</label>
        <select className="select w-full" value={type} onChange={e=>setType(e.target.value as any)}>
          <option value="dictamen">Dictamen</option>
          <option value="contrato">Contrato</option>
          <option value="memo">Memo</option>
          <option value="escrito">Escrito</option>
        </select>
        <label className="block text-sm font-medium text-slate-700">Área legal</label>
        <select className="select w-full" value={areaLegal} onChange={e=>setAreaLegal(e.target.value as any)}>
          <option value="civil_comercial">Civil, Comercial y Societario</option>
          <option value="laboral">Laboral</option>
          <option value="corporativo">Corporativo</option>
          <option value="compliance">Compliance</option>
          <option value="marcas">Marcas y Propiedad Intelectual</option>
          <option value="consumidor">Consumidor</option>
          <option value="traducir">Traducir</option>
        </select>
        <label className="block text-sm font-medium text-slate-700">Título</label>
        <input className="input w-full" placeholder="Ej.: Aplicación del art. 765 CCyC en mutuo USD" value={title} onChange={e=>setTitle(e.target.value)} />
        <label className="block text-sm font-medium text-slate-700">Instrucciones</label>
        <textarea className="textarea w-full h-28" placeholder="Hechos, contexto, puntos a resolver, tono, jurisdicción…" value={instructions} onChange={e=>setInstructions(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Transcripción (PDF opcional)</label>
          <div 
            className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500 cursor-pointer hover:bg-slate-50 transition-colors"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-slate-50"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("bg-slate-50"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-slate-50");
              const droppedFile = e.dataTransfer.files[0];
              if (droppedFile && droppedFile.type === "application/pdf") {
                setFile(droppedFile);
                setUseMemoEndpoint(true);
              } else {
                setError("Solo se aceptan archivos PDF");
              }
            }}
            onClick={() => document.getElementById("pdf-upload")?.click()}
          >
            <Upload className="h-5 w-5 mx-auto mb-2 text-slate-400" />
            {file ? (
              <div className="text-sm text-slate-900">
                <span className="font-medium">{file.name}</span>
                <button 
                  className="ml-2 text-rose-600 hover:text-rose-700"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <span>Arrastrá PDFs o hacé click para subir</span>
            )}
          </div>
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                setFile(selectedFile);
                setUseMemoEndpoint(true);
              }
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useMemoEndpoint}
              onChange={(e) => setUseMemoEndpoint(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-600">Usar generador de memos (sin RAG)</span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-5 py-2.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleSubmit} 
            disabled={loadingLocal}
          >
            {loadingLocal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Generar
              </>
            )}
          </button>
          <button 
            className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-300 bg-white text-slate-700 px-5 py-3 font-medium hover:bg-slate-50 hover:border-slate-400 transition-all" 
            onClick={()=>{ 
              setTitle(""); 
              setInstructions(""); 
              setFile(null);
              setMemoResult(null);
              setUseMemoEndpoint(false);
            }}
            disabled={loadingLocal}
          >
            <X className="h-4 w-4" />
            Limpiar
          </button>
        </div>

        {/* Indicador de progreso moderno */}
        {loadingLocal && (
          <ProgressIndicator />
        )}

        {memoResult && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 space-y-3 max-h-[400px] overflow-auto">
            <div className="text-sm font-medium text-slate-900">Resultado del Memo</div>
            <div className="text-xs text-slate-600 space-y-2">
              <div><strong>Resumen:</strong> {memoResult.resumen}</div>
              {memoResult.puntos_tratados && memoResult.puntos_tratados.length > 0 && (
                <div>
                  <strong>Puntos tratados:</strong>
                  <ul className="list-disc list-inside ml-2">
                    {memoResult.puntos_tratados.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {memoResult.proximos_pasos && memoResult.proximos_pasos.length > 0 && (
                <div>
                  <strong>Próximos pasos:</strong>
                  <ul className="list-disc list-inside ml-2">
                    {memoResult.proximos_pasos.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {memoResult.riesgos && memoResult.riesgos.length > 0 && (
                <div>
                  <strong>Riesgos:</strong>
                  <ul className="list-disc list-inside ml-2">
                    {memoResult.riesgos.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-3">
              <div className="text-xs font-medium text-slate-900 mb-1">Texto completo:</div>
              <textarea
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 p-2 text-xs font-mono"
                rows={8}
                readOnly
                value={memoResult.texto_formateado}
              />
              <button
                className="mt-2 btn-secondary text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(memoResult.texto_formateado);
                  alert("Texto copiado al portapapeles");
                }}
              >
                Copiar texto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
