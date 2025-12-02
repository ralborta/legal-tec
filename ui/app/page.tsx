"use client";
import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Gavel, BookOpen, CheckCircle2, Clock3, Users, Settings, Upload, Send, Download, ExternalLink, Trash2, Filter, Plus, History, Sparkles, Loader2, Eye, X, Zap, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
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
  const [activeView, setActiveView] = useState<"bandeja" | "analizar">("bandeja");
  const [lastGeneratedMemo, setLastGeneratedMemo] = useState<{
    content: string;
    resumen: string;
    titulo: string;
    areaLegal: string;
  } | null>(null);

  const pushItem = (entry: any) => {
    // Guardar en localStorage para persistencia entre sesiones
    const newItems = [entry, ...items];
    setItems(newItems);
    try {
      localStorage.setItem("legal-memos", JSON.stringify(newItems));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage:", e);
    }
  };

  // Cargar memos desde localStorage al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem("legal-memos");
      if (saved) {
        const parsed = JSON.parse(saved);
        setItems(parsed);
      }
    } catch (e) {
      console.warn("No se pudieron cargar memos desde localStorage:", e);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 antialiased font-display">
      <div className="flex h-screen">
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
        <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
          <Topbar />
          <main className="flex-1 p-8 overflow-y-auto">
            <div>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900">
                  {activeView === "bandeja" ? "Centro de Gestión" : "Analizar Documentos Legales"}
                </h2>
                <p className="text-gray-500 mt-1">
                  {activeView === "bandeja" 
                    ? "Operación de agentes jurídicos · WNS & Asociados"
                    : "Análisis automatizado de contratos y documentos legales"}
                </p>
              </div>

              {activeView === "bandeja" ? (
                <>
                  <KPIGrid />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 flex flex-col gap-8">
                      <BandejaLocal items={items} />
                    </div>
                    <div className="lg:col-span-1">
                      <GenerarPanel
                        onGenerated={(out) => {
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 flex flex-col gap-8">
                    <BandejaLocal items={items} />
                  </div>
                  <div className="lg:col-span-1">
                    <GenerarPanel
                      onGenerated={(out) => {
                      const newItem = {
                        id: out.id || out.documentId || crypto.randomUUID(),
                        type: out.type || "memo",
                        tipo: (out.type || "memo").toUpperCase(),
                        title: out.title,
                        asunto: out.title,
                        estado: "Listo para revisión",
                        prioridad: "Media",
                        createdAt: out.createdAt || new Date().toISOString(),
                        creado: out.createdAt ? new Date(out.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
                                 new Date(out.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) :
                                 new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
                                 new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                        agente: "Orquestador",
                        markdown: out.markdown,
                        citations: out.citations as any[],
                        memoData: out.memoData,
                        transcriptText: out.transcriptText,
                        tipoDocumento: out.tipoDocumento || "Memo / Dictamen de reunión",
                        areaLegal: out.areaLegal || out.memoData?.areaLegal || "civil_comercial"
                      };
                      pushItem(newItem);
                      // Pasar el memo al chat
                      setLastGeneratedMemo({
                        content: out.markdown,
                        resumen: out.memoData?.resumen || "",
                        titulo: out.title,
                        areaLegal: out.memoData?.areaLegal || "civil_comercial"
                      });
                    }}
                    setError={setError}
                    setLoading={setLoading}
                  />
                      <ChatPanel memoContent={lastGeneratedMemo} />
                    </div>
                  </div>
                </>
              ) : (
                <AnalizarDocumentosPanel />
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-3 text-sm">{error}</div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Estilos auxiliares */}
      <style jsx global>{`
        .icon-btn { @apply rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50 text-gray-600 transition-colors; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 { @apply text-gray-900 font-bold; }
        .markdown-content p { @apply text-gray-700; }
        .markdown-content ul, .markdown-content ol { @apply text-gray-700; }
        .markdown-content code { @apply bg-gray-100 text-gray-800 px-1 rounded; }
        .markdown-content pre { @apply bg-gray-50 border border-gray-200 p-3 rounded; }
        .markdown-content a { @apply text-[#C026D3] hover:text-[#A21CAF]; }
      `}</style>
    </div>
  );
}

function Sidebar({ activeView, setActiveView }: { activeView: string; setActiveView: (view: "bandeja" | "analizar") => void }) {
  return (
    <aside className="hidden lg:flex w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col p-4">
      <div className="flex items-center space-x-3 p-2 mb-6">
        <div className="w-10 h-10 bg-[#7E22CE] flex items-center justify-center rounded-lg">
          <span className="text-xl font-bold text-white">IA</span>
        </div>
        <div>
          <h1 className="font-bold text-base text-gray-900">Centro de Gestión</h1>
          <p className="text-sm text-gray-500">Legal Agents</p>
        </div>
      </div>
      <nav className="flex-grow flex flex-col space-y-2">
        <SideLink icon={Sparkles} label="Bandeja" active={activeView === "bandeja"} onClick={() => setActiveView("bandeja")} />
        <SideLink icon={FileText} label="Analizar Documentos" active={activeView === "analizar"} onClick={() => setActiveView("analizar")} />
        <SideLink icon={Plus} label="Generar" />
        <SideLink icon={History} label="Historial" />
        <h2 className="text-xs font-bold uppercase text-gray-400 pt-6 pb-1 px-4">Fuentes</h2>
        <SideLink icon={BookOpen} label="Normativa" />
        <SideLink icon={Gavel} label="Jurisprudencia" />
        <div className="mt-auto space-y-2">
          <SideLink icon={CheckCircle2} label="Calidad" />
          <SideLink icon={Settings} label="Configuración" />
        </div>
      </nav>
    </aside>
  );
}

function SideLink({ icon: Icon, label, active, className = "", onClick }: any) {
  return (
    <a 
      className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors cursor-pointer ${active ? "bg-[#C026D3] text-white font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"} ${className}`} 
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (onClick) onClick();
      }}
    >
      <Icon className="text-xl" />
      <span>{label}</span>
    </a>
  );
}

function Topbar() {
  return (
    <header className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Estado:</span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 mr-2 bg-green-500 rounded-full"></span>
            Operativo
          </span>
        </div>
      </div>
      <div className="flex-1 max-w-lg mx-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="w-full bg-gray-100 border-transparent rounded-lg pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[#C026D3] focus:border-transparent placeholder-gray-500" placeholder="Buscar por asunto, ID o cliente..." type="text"/>
        </div>
      </div>
      <div className="text-right text-sm text-gray-500 font-medium">
        {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </div>
    </header>
  );
}

function KPIGrid() {
  const iconColors: Record<string, string> = {
    "Solicitudes en Cola": "text-orange-500",
    "Docs Generados (7d)": "text-green-500",
    "Exactitud de Citas": "text-blue-500",
    "Latencia Media": "text-red-500",
    "Fuentes Conectadas": "text-purple-500",
    "Usuarios Activos": "text-cyan-500"
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
      {kpis.map((k, i) => {
        const iconColor = iconColors[k.title] || "text-gray-500";
        return (
          <div key={k.title} className="bg-white p-5 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-gray-600">{k.title}</p>
              <k.icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <p className="text-4xl font-bold text-gray-900 mb-3">{k.value}</p>
            {k.caption && (
              <p className={`text-xs ${k.caption.includes('+') ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                {k.caption}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BandejaLocal({ items }: { items: any[] }) {
  const memos = items.filter(item => item.type === "memo" || item.memoData);
  
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-lg text-gray-900">Bandeja de Solicitudes</h3>
          <p className="text-sm text-gray-500">Documentos generados en esta sesión</p>
        </div>
        <button className="text-gray-500 hover:text-gray-800 p-2 rounded-md hover:bg-gray-100">
          <Filter className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-grow flex flex-col gap-6">
        {memos.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">
            Aún no hay documentos generados. Creá un memo de reunión desde la derecha.
          </div>
        ) : (
          memos.map((row) => (
            <MemoCard key={row.id} memo={row} />
          ))
        )}
      </div>
    </div>
  );
}

// Componente para mostrar memos en la bandeja
function MemoCard({ memo }: { memo: any }) {
  const router = useRouter();
  
  const formatFecha = (fecha: string) => {
    try {
      const date = new Date(fecha);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + 
               date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      }
    } catch {}
    return fecha || new Date().toLocaleDateString('es-AR');
  };

  const getAreaLegalLabel = (area: string) => {
    const labels: Record<string, string> = {
      civil_comercial: "Civil, Comercial y Societario",
      laboral: "Laboral",
      corporativo: "Corporativo",
      compliance: "Compliance",
      marcas: "Marcas y Propiedad Intelectual",
      consumidor: "Consumidor",
      traducir: "Traducir"
    };
    return labels[area] || area;
  };

  return (
    <div 
      className="border border-gray-200 rounded-lg p-4 flex flex-col flex-grow cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => router.push(`/memos/${memo.id}`)}
    >
      <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
        <div>
          <h4 className="font-semibold text-gray-800">{memo.title || memo.asunto}</h4>
          <p className="text-xs text-gray-400">
            {memo.tipoDocumento || "MEMO"} · Listo para revisión · {formatFecha(memo.createdAt || memo.creado || new Date().toISOString())}
          </p>
        </div>
        <div className="flex items-center space-x-1 text-gray-500">
          <button 
            className="p-1.5 rounded-md hover:bg-gray-100 hover:text-[#C026D3]"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/memos/${memo.id}`);
            }}
          >
            <Eye className="h-5 w-5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-gray-100 hover:text-[#C026D3]">
            <Download className="h-5 w-5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
      {memo.memoData?.resumen && (
        <div className="prose prose-sm max-w-none flex-grow overflow-y-auto pr-2 text-gray-600">
          <p className="line-clamp-3">{memo.memoData.resumen}</p>
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
          <button className="icon-btn" title="Consultar con IA" onClick={() => { setQueryMode(v=>!v); setOpen(true); }}><Search className="h-4 w-4" /></button>
          <button className="icon-btn" title="Descargar Markdown" onClick={()=>downloadMD(row.asunto, row.markdown)}><Download className="h-4 w-4" /></button>
          <button className="icon-btn" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-4 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8">
          {queryMode ? (
            <QueryDocPanel memoContent={row.markdown} titulo={row.asunto} citas={row.citations} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 md:p-10 max-h-[700px] overflow-auto markdown-content text-slate-700 w-full">
                <ReactMarkdown>{row.markdown}</ReactMarkdown>
              </div>
              <div className="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 via-purple-50/50 to-purple-100/30 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Referencias Legales Utilizadas
                </div>
                {(row.citations && row.citations.length > 0) ? (
                  <ul className="space-y-3 text-sm">
                    {row.citations.map((c:any, i:number) => (
                      <li key={i} className="flex items-start gap-3 bg-white/60 rounded-lg p-3 border border-purple-100">
                        <span className={`mt-1 h-3 w-3 rounded-full shrink-0 ${
                          c.source === "normativa" ? "bg-blue-500" :
                          c.source === "jurisprudencia" ? "bg-purple-500" :
                          c.source === "doctrina" ? "bg-orange-500" :
                          "bg-emerald-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-900 font-semibold text-sm">{c.title || "(sin título)"}</div>
                          {c.descripcion && (
                            <div className="text-slate-600 text-xs mt-1">{c.descripcion}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              c.source === "normativa" ? "bg-blue-100 text-blue-700" :
                              c.source === "jurisprudencia" ? "bg-purple-100 text-purple-700" :
                              c.source === "doctrina" ? "bg-orange-100 text-orange-700" :
                              "bg-emerald-100 text-emerald-700"
                            }`}>
                              {c.source === "normativa" ? "Normativa" :
                               c.source === "jurisprudencia" ? "Jurisprudencia" :
                               c.source === "doctrina" ? "Doctrina" : "Otra"}
                            </span>
                            {c.url && (
                              <a 
                                className="text-xs text-purple-600 hover:text-purple-700 underline flex items-center gap-1" 
                                href={c.url} 
                                target="_blank" 
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Ver fuente
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-purple-600 italic bg-white/40 rounded-lg p-3 text-center">
                    No hay referencias legales registradas
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueryDocPanel({ memoContent, titulo, citas }: { memoContent: string; titulo: string; citas?: any[] }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<Array<{query: string; response: string}>>([]);
  const API = useMemo(() => getApiUrl(), []);

  async function handleQuery() {
    if (!query.trim() || !API) return;
    setLoading(true);
    setResponse(null);
    try {
      const r = await fetch(`${API}/api/memos/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          memoContent, 
          query,
          titulo,
          citas: citas || []
        })
      });
      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`Error ${r.status}: ${errorText || "Error desconocido"}`);
      }
      const data = await r.json();
      setResponse(data.response);
      // Agregar a la conversación
      setConversation(prev => [...prev, { query, response: data.response }]);
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
        <div className="text-sm font-medium text-slate-900 mb-1">💬 Chat sobre el Memo</div>
        <div className="text-xs text-slate-500">Hacé preguntas o pedí modificaciones sobre el memo generado</div>
      </div>

      {/* Historial de conversación */}
      {conversation.length > 0 && (
        <div className="space-y-3 max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
          {conversation.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="text-xs font-medium text-blue-600">Tu pregunta:</div>
              <div className="text-sm text-slate-700 bg-white p-2 rounded border border-slate-200">{item.query}</div>
              <div className="text-xs font-medium text-emerald-600">Respuesta:</div>
              <div className="text-sm text-slate-700 bg-white p-2 rounded border border-slate-200 whitespace-pre-wrap">{item.response}</div>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ej: ¿Qué dice sobre los próximos pasos? / Explica la sección de riesgos / Modifica el análisis jurídico para ser más específico"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleQuery()}
          disabled={loading}
        />
        <button className="btn" onClick={handleQuery} disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              ...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Enviar
            </>
          )}
        </button>
      </div>

      {response && conversation.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500 mb-2 font-medium">Respuesta:</div>
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

// Componente para analizar documentos legales
function AnalizarDocumentosPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor selecciona un archivo PDF");
      return;
    }

    setError(null);
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API}/legal/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error al subir archivo: ${response.statusText}`);
      }

      const data = await response.json();
      setDocumentId(data.documentId);

      // Iniciar análisis
      const analyzeResponse = await fetch(`${API}/legal/analyze/${data.documentId}`, {
        method: "POST",
      });

      if (!analyzeResponse.ok) {
        throw new Error("Error al iniciar análisis");
      }

      // Iniciar polling para obtener resultados
      setPolling(true);
      pollForResults(data.documentId);
    } catch (err: any) {
      setError(err.message || "Error al procesar documento");
      setAnalyzing(false);
    }
  };

  const pollForResults = async (docId: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`${API}/legal/result/${docId}`);
        
        if (!response.ok) {
          throw new Error("Error al obtener resultados");
        }

        const result = await response.json();

        if (result.analysis) {
          setAnalysisResult(result);
          setAnalyzing(false);
          setPolling(false);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 3000); // Poll cada 3 segundos
        } else {
          setError("El análisis está tomando más tiempo del esperado. Intenta más tarde.");
          setAnalyzing(false);
          setPolling(false);
        }
      } catch (err: any) {
        setError(err.message || "Error al obtener resultados");
        setAnalyzing(false);
        setPolling(false);
      }
    };

    poll();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-2">Subir Documento Legal</h3>
        <p className="text-sm text-gray-500 mb-6">
          Analiza contratos, acuerdos y documentos legales con IA
        </p>

        <div className="space-y-4">
          <div
            className="flex justify-center px-6 pt-8 pb-8 border-2 border-gray-300 border-dashed rounded-lg bg-gray-50/50 hover:border-[#C026D3]/40 transition cursor-pointer"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("bg-slate-50");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("bg-slate-50");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-slate-50");
              const droppedFile = e.dataTransfer.files[0];
              if (droppedFile && droppedFile.type === "application/pdf") {
                setFile(droppedFile);
              } else {
                setError("Solo se aceptan archivos PDF");
              }
            }}
            onClick={() => document.getElementById("legal-doc-upload")?.click()}
          >
            <div className="space-y-2 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400" />
              {file ? (
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{file.name}</span>
                  <button
                    className="ml-2 text-rose-600 hover:text-rose-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setDocumentId(null);
                      setAnalysisResult(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Arrastrá PDFs o hacé click para subir</p>
              )}
            </div>
          </div>
          <input
            id="legal-doc-upload"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                setFile(selectedFile);
                setError(null);
              }
            }}
          />

          <button
            className="w-full bg-gradient-to-r from-[#C026D3] to-[#A21CAF] text-white py-3 px-6 rounded-lg font-medium hover:from-[#A21CAF] hover:to-[#7E1A8A] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            onClick={handleUpload}
            disabled={!file || analyzing}
          >
            {analyzing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {polling ? "Analizando documento..." : "Subiendo..."}
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Analizar Documento
              </>
            )}
          </button>

          {documentId && (
            <div className="text-xs text-gray-500 text-center">
              ID: {documentId}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-2">Resultado del Análisis</h3>
        <p className="text-sm text-gray-500 mb-6">
          {analysisResult ? "Análisis completado" : "Esperando análisis..."}
        </p>

        {analysisResult?.analysis ? (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Tipo de Documento</h4>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {analysisResult.analysis.type}
              </p>
            </div>

            {analysisResult.analysis.checklist?.items && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Checklist de Análisis</h4>
                <div className="space-y-2">
                  {analysisResult.analysis.checklist.items.map((item: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-gray-900">{item.key}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.found === "yes" ? "bg-green-100 text-green-800" :
                          item.found === "no" ? "bg-red-100 text-red-800" :
                          "bg-yellow-100 text-yellow-800"
                        }`}>
                          {item.found}
                        </span>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded inline-block mt-1 ${
                        item.risk === "high" ? "bg-red-100 text-red-800" :
                        item.risk === "medium" ? "bg-yellow-100 text-yellow-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        Riesgo: {item.risk}
                      </div>
                      {item.comment && (
                        <p className="text-xs text-gray-600 mt-2">{item.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.analysis.report && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Reporte Completo</h4>
                <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                  {analysisResult.analysis.report}
                </div>
              </div>
            )}
          </div>
        ) : analyzing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#C026D3] mb-4" />
            <p className="text-sm text-gray-500">Procesando documento...</p>
            <p className="text-xs text-gray-400 mt-2">Esto puede tomar unos momentos</p>
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-12 text-center">
            Sube un documento para comenzar el análisis
          </div>
        )}
      </div>
    </div>
  );
}

// Componente para analizar documentos legales
function AnalizarDocumentosPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor selecciona un archivo PDF");
      return;
    }

    setError(null);
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API}/legal/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error al subir archivo: ${response.statusText}`);
      }

      const data = await response.json();
      setDocumentId(data.documentId);

      // Iniciar análisis
      const analyzeResponse = await fetch(`${API}/legal/analyze/${data.documentId}`, {
        method: "POST",
      });

      if (!analyzeResponse.ok) {
        throw new Error("Error al iniciar análisis");
      }

      // Iniciar polling para obtener resultados
      setPolling(true);
      pollForResults(data.documentId);
    } catch (err: any) {
      setError(err.message || "Error al procesar documento");
      setAnalyzing(false);
    }
  };

  const pollForResults = async (docId: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`${API}/legal/result/${docId}`);
        
        if (!response.ok) {
          throw new Error("Error al obtener resultados");
        }

        const result = await response.json();

        if (result.analysis) {
          setAnalysisResult(result);
          setAnalyzing(false);
          setPolling(false);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 3000); // Poll cada 3 segundos
        } else {
          setError("El análisis está tomando más tiempo del esperado. Intenta más tarde.");
          setAnalyzing(false);
          setPolling(false);
        }
      } catch (err: any) {
        setError(err.message || "Error al obtener resultados");
        setAnalyzing(false);
        setPolling(false);
      }
    };

    poll();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-2">Subir Documento Legal</h3>
        <p className="text-sm text-gray-500 mb-6">
          Analiza contratos, acuerdos y documentos legales con IA
        </p>

        <div className="space-y-4">
          <div
            className="flex justify-center px-6 pt-8 pb-8 border-2 border-gray-300 border-dashed rounded-lg bg-gray-50/50 hover:border-[#C026D3]/40 transition cursor-pointer"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("bg-slate-50");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("bg-slate-50");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-slate-50");
              const droppedFile = e.dataTransfer.files[0];
              if (droppedFile && droppedFile.type === "application/pdf") {
                setFile(droppedFile);
              } else {
                setError("Solo se aceptan archivos PDF");
              }
            }}
            onClick={() => document.getElementById("legal-doc-upload")?.click()}
          >
            <div className="space-y-2 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400" />
              {file ? (
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{file.name}</span>
                  <button
                    className="ml-2 text-rose-600 hover:text-rose-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setDocumentId(null);
                      setAnalysisResult(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Arrastrá PDFs o hacé click para subir</p>
              )}
            </div>
          </div>
          <input
            id="legal-doc-upload"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                setFile(selectedFile);
                setError(null);
              }
            }}
          />

          <button
            className="w-full bg-gradient-to-r from-[#C026D3] to-[#A21CAF] text-white py-3 px-6 rounded-lg font-medium hover:from-[#A21CAF] hover:to-[#7E1A8A] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            onClick={handleUpload}
            disabled={!file || analyzing}
          >
            {analyzing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {polling ? "Analizando documento..." : "Subiendo..."}
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Analizar Documento
              </>
            )}
          </button>

          {documentId && (
            <div className="text-xs text-gray-500 text-center">
              ID: {documentId}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-2">Resultado del Análisis</h3>
        <p className="text-sm text-gray-500 mb-6">
          {analysisResult ? "Análisis completado" : "Esperando análisis..."}
        </p>

        {analysisResult?.analysis ? (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Tipo de Documento</h4>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {analysisResult.analysis.type}
              </p>
            </div>

            {analysisResult.analysis.checklist?.items && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Checklist de Análisis</h4>
                <div className="space-y-2">
                  {analysisResult.analysis.checklist.items.map((item: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-gray-900">{item.key}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.found === "yes" ? "bg-green-100 text-green-800" :
                          item.found === "no" ? "bg-red-100 text-red-800" :
                          "bg-yellow-100 text-yellow-800"
                        }`}>
                          {item.found}
                        </span>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded inline-block mt-1 ${
                        item.risk === "high" ? "bg-red-100 text-red-800" :
                        item.risk === "medium" ? "bg-yellow-100 text-yellow-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        Riesgo: {item.risk}
                      </div>
                      {item.comment && (
                        <p className="text-xs text-gray-600 mt-2">{item.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.analysis.report && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Reporte Completo</h4>
                <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                  {analysisResult.analysis.report}
                </div>
              </div>
            )}
          </div>
        ) : analyzing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#C026D3] mb-4" />
            <p className="text-sm text-gray-500">Procesando documento...</p>
            <p className="text-xs text-gray-400 mt-2">Esto puede tomar unos momentos</p>
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-12 text-center">
            Sube un documento para comenzar el análisis
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [type, setType] = useState<"dictamen"|"contrato"|"memo"|"escrito">("memo"); // Cambiar default a "memo"
  const [areaLegal, setAreaLegal] = useState<"civil_comercial"|"laboral"|"corporativo"|"compliance"|"marcas"|"consumidor"|"traducir">("civil_comercial");
  const [file, setFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState(""); // Nuevo: texto de transcripción
  const [showTranscriptText, setShowTranscriptText] = useState(false); // Controlar visibilidad del textarea
  const [memoResult, setMemoResult] = useState<any | null>(null);
  const [generationMode, setGenerationMode] = useState<"memo" | "dictamen_rag">("memo"); // Radio buttons
  const [loadingLocal, setLoadingLocal] = useState(false); // Estado local para loading
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{id: string; name: string; enabled: boolean}>>([]);
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<string[]>([]);
  const API = useMemo(() => getApiUrl(), []);

  // Cargar bases de conocimiento disponibles
  useEffect(() => {
    if (!API) return;
    fetch(`${API}/api/knowledge-bases`)
      .then(r => r.json())
      .then(data => {
        const enabled = (data.knowledgeBases || []).filter((kb: any) => kb.enabled);
        setKnowledgeBases(enabled);
      })
      .catch(err => {
        console.warn("No se pudieron cargar las bases de conocimiento:", err);
      });
  }, [API]);

  async function handleSubmit() {
    setError(null); 
    setLoadingLocal(true);
    setLoading(true); 
    setMemoResult(null);
    try {
      if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");

      // Si hay archivo PDF o se quiere usar el endpoint de memos, usar /api/memos/generate
      if (generationMode === "memo" || file || transcriptText) {
        const formData = new FormData();
        formData.append("tipoDocumento", type === "memo" ? "Memo de reunión" : type);
        formData.append("titulo", title);
        formData.append("instrucciones", instructions);
        formData.append("areaLegal", areaLegal);
        // Prioridad: PDF primero, luego texto
        if (file) {
          formData.append("transcripcion", file);
        } else if (transcriptText.trim()) {
          formData.append("transcriptText", transcriptText);
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
                      url: c.url || undefined,
                      descripcion: c.descripcion || undefined
                    }));
                    const memoId = crypto.randomUUID();
                    onGenerated({ 
                      id: memoId,
                      type: "memo", 
                      title, 
                      markdown: data.texto_formateado, 
                      memoData: {
                        ...data,
                        areaLegal: areaLegal,
                        transcriptText: transcriptText || (file ? "PDF subido" : "") // Guardar transcriptText para el chat
                      },
                      citations: citations,
                      transcriptText: transcriptText || (file ? "PDF subido" : ""), // Guardar para usar en chat
                      tipoDocumento: "Memo / Dictamen de reunión",
                      areaLegal: areaLegal,
                      createdAt: new Date().toISOString()
                    });
                    setTitle(""); setInstructions(""); setFile(null); setTranscriptText(""); setShowTranscriptText(false);
      } else {
        // Endpoint original /v1/generate (RAG con corpus)
        const requestBody: any = { type, title, instructions };
        // Añadir filtros de bases de conocimiento si se seleccionaron
        if (selectedKnowledgeBases.length > 0) {
          requestBody.knowledgeBases = selectedKnowledgeBases;
        }
        const r = await fetch(`${API}/v1/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
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
    <div className="bg-white p-6 rounded-xl border border-gray-200">
      <h3 className="font-bold text-lg text-gray-900">Generar Documento</h3>
      <p className="text-sm text-gray-500 mb-6">Orquesta agentes Normativo + Jurisprudencial</p>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div>
          <label className="text-sm font-medium text-gray-600">Tipo de documento</label>
          <div className="relative mt-1">
            <select className="w-full bg-gray-50 border-gray-300 rounded-md py-2 pl-3 pr-10 text-sm focus:ring-[#C026D3] focus:border-[#C026D3]" value={type} onChange={e=>setType(e.target.value as any)}>
              <option value="memo">Memo</option>
              <option value="dictamen">Dictamen</option>
              <option value="contrato">Contrato</option>
              <option value="escrito">Escrito</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Área legal</label>
          <div className="relative mt-1">
            <select className="w-full bg-gray-50 border-gray-300 rounded-md py-2 pl-3 pr-10 text-sm focus:ring-[#C026D3] focus:border-[#C026D3]" value={areaLegal} onChange={e=>setAreaLegal(e.target.value as any)}>
              <option value="civil_comercial">Civil, Comercial y Societario</option>
              <option value="laboral">Laboral</option>
              <option value="corporativo">Corporativo</option>
              <option value="compliance">Compliance</option>
              <option value="marcas">Marcas y Propiedad Intelectual</option>
              <option value="consumidor">Consumidor</option>
              <option value="traducir">Traducir</option>
            </select>
          </div>
        </div>
        
        {/* Selector de bases de conocimiento (solo para RAG, no para memos) */}
        {generationMode === "dictamen_rag" && !file && !transcriptText && knowledgeBases.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Bases de conocimiento (opcional)
            </label>
            <div className="text-xs text-slate-500 mb-2">
              Seleccioná las bases a usar. Si no seleccionás ninguna, se usarán todas.
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
              {knowledgeBases.map((kb) => (
                <label key={kb.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedKnowledgeBases.includes(kb.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedKnowledgeBases([...selectedKnowledgeBases, kb.id]);
                      } else {
                        setSelectedKnowledgeBases(selectedKnowledgeBases.filter(id => id !== kb.id));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-slate-700">{kb.name}</span>
                </label>
              ))}
            </div>
            {selectedKnowledgeBases.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedKnowledgeBases([])}
                className="mt-1 text-xs text-blue-600 hover:text-blue-700"
              >
                Limpiar selección
              </button>
            )}
          </div>
        )}
        
        <div>
          <label className="text-sm font-medium text-gray-600">Título</label>
          <input className="mt-1 w-full bg-gray-50 border-gray-300 rounded-md text-sm placeholder-gray-400 focus:ring-[#C026D3] focus:border-[#C026D3]" placeholder="Ej.: Aplicación del art. 765 CCyC en mutuo USD" value={title} onChange={e=>setTitle(e.target.value)} type="text"/>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Instrucciones</label>
          <textarea className="mt-1 w-full bg-gray-50 border-gray-300 rounded-md text-sm placeholder-gray-400 focus:ring-[#C026D3] focus:border-[#C026D3]" placeholder="Hechos, contexto, puntos a resolver, tono, jurisdicción..." rows={3} value={instructions} onChange={e=>setInstructions(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Transcripción (PDF opcional)</label>
          <div 
            className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md bg-gray-50/50 hover:border-[#C026D3]/40 transition cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-slate-50"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("bg-slate-50"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("bg-slate-50");
              const droppedFile = e.dataTransfer.files[0];
              if (droppedFile && droppedFile.type === "application/pdf") {
                setFile(droppedFile);
                setGenerationMode("memo");
              } else {
                setError("Solo se aceptan archivos PDF");
              }
            }}
            onClick={() => document.getElementById("pdf-upload")?.click()}
          >
            <div className="space-y-1 text-center">
              <Upload className="h-10 w-10 mx-auto text-gray-400" />
              {file ? (
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{file.name}</span>
                  <button 
                    className="ml-2 text-rose-600 hover:text-rose-700"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Arrastrá PDFs o hacé click para subir</p>
              )}
            </div>
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
                setGenerationMode("memo");
              }
            }}
          />
          {/* Opción para pegar texto */}
          <div className="mt-2">
            {!showTranscriptText ? (
              <button
                type="button"
                onClick={() => setShowTranscriptText(true)}
                className="text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Pegar texto
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">Texto de la transcripción</label>
                <textarea
                  className="textarea w-full h-32 text-sm"
                  placeholder="Pegá aquí el texto de la transcripción..."
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowTranscriptText(false);
                    setTranscriptText("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Ocultar
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center">
          <input checked={generationMode === "memo"} className="h-4 w-4 rounded border-gray-300 text-[#C026D3] focus:ring-[#C026D3]" id="use-rag" type="checkbox" onChange={() => setGenerationMode("memo")} />
          <label className="ml-2 block text-sm text-gray-800" htmlFor="use-rag">Usar generador de memos (sin RAG)</label>
        </div>
        {file && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
            <div className="text-blue-900 font-medium mb-1">💡 Modo Chat disponible</div>
            <div className="text-blue-700 text-xs">Con el archivo subido, también podés usar el modo chat para consultar paso a paso cómo proceder.</div>
          </div>
        )}
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button 
            className="flex items-center space-x-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium" 
            type="button"
            onClick={()=>{ 
              setTitle(""); 
              setInstructions(""); 
              setFile(null);
              setTranscriptText("");
              setShowTranscriptText(false);
              setMemoResult(null);
              setGenerationMode("memo");
            }}
            disabled={loadingLocal}
          >
            <X className="text-base" />
            <span>Limpiar</span>
          </button>
          <button 
            className="flex items-center space-x-2 bg-[#C026D3] text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-[#A21CAF] transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed" 
            type="submit"
            disabled={loadingLocal}
          >
            {loadingLocal ? (
              <>
                <Loader2 className="text-base animate-spin" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <Send className="text-base" />
                <span>Generar</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Indicador de progreso moderno */}
      {loadingLocal && (
        <ProgressIndicator />
      )}

      {memoResult && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 space-y-3 max-h-[400px] overflow-auto">
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
  );
}

function ChatPanel({ memoContent }: { memoContent: { content: string; resumen: string; titulo: string; areaLegal: string } | null }) {
  const [messages, setMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  // Resetear cuando cambia el memo
  useEffect(() => {
    if (memoContent) {
      setMessages([]);
      setChatStarted(false);
    }
  }, [memoContent?.titulo]);

  // Iniciar chat automáticamente cuando hay un memo generado
  useEffect(() => {
    if (memoContent && !chatStarted && messages.length === 0) {
      setChatStarted(true);
      // Iniciar con el resumen del memo después de un pequeño delay
      setTimeout(() => {
        const initialMessage = memoContent.resumen 
          ? `He generado un memo sobre "${memoContent.titulo}". El resumen es:\n\n${memoContent.resumen}\n\n¿Cómo puedo ayudarte con el proceso legal?`
          : `He generado un memo sobre "${memoContent.titulo}". ¿Cómo puedo ayudarte con el proceso legal?`;
        handleSendMessage(initialMessage, true);
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoContent?.titulo, chatStarted]);

  async function handleSendMessage(messageText?: string, isInitial = false) {
    const textToSend = messageText || currentMessage;
    if (!textToSend.trim() || !API || !memoContent) return;

    const userMessage = { role: "user" as const, content: textToSend };
    const newMessages = isInitial ? [userMessage] : [...messages, userMessage];
    if (!isInitial) {
      setMessages(newMessages);
    }
    setCurrentMessage("");
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/memos/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: memoContent.content, // Usar el contenido del memo generado
          messages: newMessages,
          areaLegal: memoContent.areaLegal
        })
      });

      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`Error ${r.status}: ${errorText || "Error desconocido"}`);
      }

      const data = await r.json();
      const assistantMessage = { role: "assistant" as const, content: data.message };
      setMessages([...newMessages, assistantMessage]);
    } catch (e: any) {
      const errorMessage = { role: "assistant" as const, content: `Error: ${e.message || "Error al procesar la consulta"}` };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  if (!memoContent) {
    return (
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-slate-900 font-semibold">💬 Chat con Asistente</div>
            <div className="text-slate-500 text-xs">Se activará cuando generes un memo</div>
          </div>
        </div>
        <div className="text-sm text-slate-600 mt-3">
          Generá un memo primero y luego podrás consultar cómo proceder paso a paso.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden flex flex-col" style={{ maxHeight: "600px" }}>
      {/* Header del chat */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Asistente Jurídico</div>
              <div className="text-xs text-blue-100">Consultá sobre: {memoContent.titulo}</div>
            </div>
          </div>
          {memoContent.resumen && (
            <div className="text-xs bg-white/20 px-2 py-1 rounded-full">
              Resumen disponible
            </div>
          )}
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-slate-50 to-white space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-sm text-slate-600 text-center max-w-xs">
              Iniciando conversación sobre el memo generado...
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "user" 
                    ? "bg-blue-600" 
                    : "bg-gradient-to-br from-purple-500 to-blue-500"
                }`}>
                  {msg.role === "user" ? (
                    <Users className="h-4 w-4 text-white" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-white" />
                  )}
                </div>
                
                {/* Mensaje */}
                <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === "user" 
                    ? "bg-blue-600 text-white rounded-br-sm" 
                    : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm"
                }`}>
                  <div className="text-xs font-medium mb-1.5 opacity-80">
                    {msg.role === "user" ? "Vos" : "Asistente WNS"}
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            </motion.div>
          ))
        )}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white p-4">
        <div className="flex gap-2">
          <input
            className="input flex-1 rounded-full border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="Ej: ¿Qué documentos debo presentar? / ¿Cómo manejo este proceso? / ¿Qué pasos sigo?"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !loading && handleSendMessage()}
            disabled={loading || !memoContent}
          />
          <button 
            className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" 
            onClick={() => handleSendMessage()} 
            disabled={loading || !currentMessage.trim() || !memoContent}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="text-xs text-slate-400 mt-2 text-center">
          Presioná Enter para enviar
        </div>
      </div>
    </div>
  );
}
