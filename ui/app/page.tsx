"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Gavel, BookOpen, CheckCircle2, Clock3, Users, Settings, Upload, Send, Download, ExternalLink, Trash2, Filter, Plus, History, Sparkles, Loader2, Eye, X } from "lucide-react";
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

// Helper para obtener URL de legal-docs (upload directo, sin proxy)
function getLegalDocsUrl(): string {
  // Si hay URL específica de legal-docs, usarla (upload directo)
  const legalDocsUrl = process.env.NEXT_PUBLIC_LEGAL_DOCS_URL || "";
  if (legalDocsUrl) {
    return legalDocsUrl.endsWith("/") ? legalDocsUrl.slice(0, -1) : legalDocsUrl;
  }
  // Fallback: usar API gateway (menos ideal, pero funciona)
  return getApiUrl();
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
  const [activeView, setActiveView] = useState<"bandeja" | "analizar" | "generar" | "historial">("bandeja");
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

  // Cargar historial desde API y localStorage
  useEffect(() => {
    const API = getApiUrl();
    
    // Cargar desde localStorage primero (items locales)
    let localItems: any[] = [];
    try {
      const saved = localStorage.getItem("legal-memos");
      if (saved) {
        localItems = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("No se pudieron cargar memos desde localStorage:", e);
    }

    // Cargar desde la API (items de la DB)
    if (API) {
      fetch(`${API}/api/history`)
        .then(r => r.json())
        .then(data => {
          const dbItems = data.items || [];
          // Combinar items locales con los de la DB, evitando duplicados por ID
          const localIds = new Set(localItems.map((i: any) => i.id));
          const combinedItems = [
            ...localItems,
            ...dbItems.filter((i: any) => !localIds.has(i.id))
          ];
          // Ordenar por fecha
          combinedItems.sort((a, b) => {
            const fechaA = new Date(a.createdAt || 0).getTime();
            const fechaB = new Date(b.createdAt || 0).getTime();
            return fechaB - fechaA;
          });
          setItems(combinedItems);
        })
        .catch(err => {
          console.warn("No se pudo cargar historial desde API:", err);
          setItems(localItems);
        });
    } else {
      setItems(localItems);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 antialiased font-display">
      <div className="flex h-screen">
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
        <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
          <Topbar activeView={activeView} setActiveView={setActiveView} />
          <main className="flex-1 p-8 overflow-y-auto">
            <div>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900">
                  {activeView === "bandeja" ? "Centro de Gestión" : activeView === "analizar" ? "Analizar Documentos Legales" : activeView === "generar" ? "Generar Documentos" : "Historial"}
                </h2>
                <p className="text-gray-500 mt-1">
                  {activeView === "bandeja" 
                    ? "Operación de agentes jurídicos · WNS & Asociados"
                    : activeView === "analizar"
                    ? "Análisis automatizado de contratos y documentos legales"
                    : activeView === "generar"
                    ? "Generación de memos, dictámenes, contratos y documentos legales"
                    : "Todos tus documentos organizados por tipo"}
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
                    </div>
                  </div>
                  {/* Chat debajo del contenido cuando hay un memo generado */}
                  {lastGeneratedMemo && (
                    <div className="mt-8">
                  <ChatPanel memoContent={lastGeneratedMemo} />
                </div>
                  )}
                </>
              ) : activeView === "analizar" ? (
                <AnalizarDocumentosPanel />
              ) : activeView === "generar" ? (
                /* Vista Generar - pantalla completa */
                <div className="max-w-4xl mx-auto">
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
                  <div className="mt-6">
                    <ChatPanel memoContent={lastGeneratedMemo} />
              </div>
                </div>
              ) : activeView === "historial" ? (
                <HistorialPanel items={items} />
              ) : null}

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

function Sidebar({ activeView, setActiveView }: { activeView: string; setActiveView: (view: "bandeja" | "analizar" | "generar" | "historial") => void }) {
  return (
    <aside className="hidden lg:flex w-64 flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col">
      <nav className="flex-grow flex flex-col p-4 space-y-1">
        <SideLink icon={Sparkles} label="Bandeja" active={activeView === "bandeja"} onClick={() => setActiveView("bandeja")} />
        <SideLink icon={FileText} label="Analizar Documentos" active={activeView === "analizar"} onClick={() => setActiveView("analizar")} />
        <SideLink icon={Plus} label="Generar" active={activeView === "generar"} onClick={() => setActiveView("generar")} />
        <SideLink icon={History} label="Historial" active={activeView === "historial"} onClick={() => setActiveView("historial")} />
        <h2 className="text-xs font-bold uppercase text-gray-400 pt-6 pb-2 px-4">FUENTES</h2>
        <SideLink icon={BookOpen} label="Normativa" />
        <SideLink icon={Gavel} label="Jurisprudencia" />
        <div className="mt-auto space-y-1 pt-4 border-t border-gray-700">
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
      className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors cursor-pointer ${
        active 
          ? "bg-blue-600 text-white font-medium" 
          : "text-gray-300 hover:bg-gray-700 hover:text-white"
      } ${className}`} 
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (onClick) onClick();
      }}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </a>
  );
}

function Topbar({ activeView, setActiveView }: { activeView: string; setActiveView: (view: "bandeja" | "analizar" | "generar" | "historial") => void }) {
  // Evitar hydration mismatch: calcular fecha solo en cliente
  const [today, setToday] = React.useState("");

  React.useEffect(() => {
    setToday(
      new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    );
  }, []);

  return (
    <header className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
      {/* Logo y Estado */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#7E22CE] flex items-center justify-center rounded-lg">
            <span className="text-xl font-bold text-white">IA</span>
          </div>
          <div>
            <h1 className="font-bold text-base text-gray-900">Centro de Gestión</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Estado:</span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 mr-2 bg-green-500 rounded-full"></span>
            Operativo
          </span>
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex-1 max-w-lg mx-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="w-full bg-gray-100 border-transparent rounded-lg pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[#C026D3] focus:border-transparent placeholder-gray-500" placeholder="Buscar por asunto, ID o cliente..." type="text"/>
        </div>
      </div>

      {/* Botones de acción y fecha */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveView("analizar")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === "analizar" 
              ? "bg-[#C026D3] text-white" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Analizar Documentos
        </button>
        <button
          onClick={() => setActiveView("generar")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === "generar" 
              ? "bg-[#C026D3] text-white" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Generar Documento
        </button>
        <button
          onClick={() => setActiveView("historial")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === "historial" 
              ? "bg-[#C026D3] text-white" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Ver Historial
        </button>
        <div className="text-right text-sm text-gray-500 font-medium ml-4">
          {today || ""}
        </div>
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

  const formatFecha = (fecha: string) => {
    try {
      const date = new Date(fecha);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    } catch {}
    return fecha || new Date().toLocaleDateString('es-AR');
  };
  
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-lg text-gray-900">Bandeja de Solicitudes</h3>
          <p className="text-sm text-gray-500">Documentos generados a sesión</p>
        </div>
        <button className="text-gray-500 hover:text-gray-800 p-2 rounded-md hover:bg-gray-100">
          <Filter className="h-5 w-5" />
        </button>
      </div>
      
      {/* Tabla de solicitudes */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Documento</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Tipo</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Área</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Fecha</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
        {memos.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-sm text-gray-500 py-8 text-center">
            Aún no hay documentos generados. Creá un memo de reunión desde la derecha.
                </td>
              </tr>
        ) : (
          memos.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900 font-medium">{row.title || row.asunto}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{row.tipoDocumento || "Memo"}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{getAreaLegalLabel(row.areaLegal || "civil_comercial")}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center text-sm text-gray-600">
                      <span className="w-2 h-2 mr-2 bg-amber-500 rounded-full"></span>
                      Pendiente
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{formatFecha(row.createdAt || row.creado || new Date().toISOString())}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-[#C026D3]"
                        onClick={() => window.location.href = `/memos/${row.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-[#C026D3]">
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
  const [progress, setProgress] = useState<number>(0);
  const [statusLabel, setStatusLabel] = useState<string>("");
  const API = useMemo(() => getApiUrl(), []);
  const LEGAL_DOCS_URL = useMemo(() => getLegalDocsUrl(), []);

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  function toUserFriendlyError(err: unknown, fallback: string) {
    // Cuando AbortController corta el fetch, Chrome suele mostrar:
    // "signal is aborted without reason" (AbortError)
    if (err && typeof err === "object") {
      const anyErr = err as any;
      const name = anyErr?.name as string | undefined;
      const message = anyErr?.message as string | undefined;
      if (name === "AbortError" || (message && /aborted/i.test(message))) {
        return "Tiempo de espera agotado. Railway puede estar iniciando (cold start) o la subida es lenta. Reintentá en unos segundos.";
      }
      if (message) return message;
    }
    return fallback;
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor selecciona un archivo PDF");
      return;
    }

    setError(null);
    setAnalyzing(true);
    setProgress(0);
    setStatusLabel("Subiendo…");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // ✅ UPLOAD DIRECTO a legal-docs (sin proxy) para evitar ERR_STREAM_PREMATURE_CLOSE
      // Si NEXT_PUBLIC_LEGAL_DOCS_URL está configurada, usa esa (directo)
      // Si no, usa API gateway (fallback)
      const uploadUrl = LEGAL_DOCS_URL !== API 
        ? `${LEGAL_DOCS_URL}/upload`  // Directo a legal-docs
        : `${API}/legal/upload`;       // Vía gateway (fallback)
      
      console.log(`[UPLOAD] Subiendo a: ${uploadUrl}`);
      
      const response = await fetchWithTimeout(uploadUrl, {
        method: "POST",
        body: formData,
      }, 180000); // 3 minutos para upload directo (sin proxy)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Error al subir archivo (${response.status}): ${errorText || response.statusText || "Sin detalles"}`);
      }

      const data = await response.json();
      setDocumentId(data.documentId);

      // Iniciar análisis (timeout corto: /analyze es fire-and-forget, solo necesita confirmación)
      setStatusLabel("Iniciando análisis…");
      const analyzeResponse = await fetchWithTimeout(`${API}/legal/analyze/${data.documentId}`, {
        method: "POST",
      }, 30000); // 30s - suficiente para confirmación (gateway tiene 10s, pero damos margen para cold start)

      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text().catch(() => "");
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Error desconocido" };
        }
        throw new Error(`Error al iniciar análisis (${analyzeResponse.status}): ${errorData.error || errorData.message || "Sin detalles"}`);
      }

      // Iniciar polling para obtener resultados
      setPolling(true);
      pollForResults(data.documentId);
    } catch (err: any) {
      setError(toUserFriendlyError(err, "Error al procesar documento"));
      setAnalyzing(false);
    }
  };

  const pollForResults = async (docId: string) => {
    const maxAttempts = 60; // ~3 min
    let attempts = 0;
    let consecutive502s = 0;
    const maxConsecutive502s = 5; // Si hay 5 502s seguidos, parar

    const poll = async () => {
      try {
        // 1) Obtener status/progreso primero (si existe)
        try {
          const statusRes = await fetchWithTimeout(`${API}/legal/status/${docId}`, {}, 15000);
          if (statusRes.ok) {
            const s = await statusRes.json();
            if (typeof s.progress === "number") setProgress(s.progress);
            if (s.status) setStatusLabel(`Estado: ${s.status}`);
            if (s.status === "error") {
              setError(s.error || "Error durante el análisis");
              setAnalyzing(false);
              setPolling(false);
              return;
            }
          }
        } catch {
          // ignorar: seguimos con /result
        }

        // 2) Intentar obtener resultado
        const response = await fetchWithTimeout(`${API}/legal/result/${docId}`, {}, 15000);
        if (!response.ok) {
          // Si es 502, puede ser cold start - continuar intentando
          if (response.status === 502) {
            consecutive502s++;
            if (consecutive502s >= maxConsecutive502s) {
              setError("El servicio de análisis no está disponible. Por favor, intenta más tarde o verifica el estado del servicio.");
              setAnalyzing(false);
              setPolling(false);
              return;
            }
            // Continuar polling - puede ser un cold start temporal
            if (attempts < maxAttempts) {
              attempts++;
              setStatusLabel(`Servicio iniciando... (intento ${attempts}/${maxAttempts})`);
              setTimeout(poll, 5000); // Esperar un poco más en caso de cold start
              return;
            }
          }
          // Para otros errores, lanzar excepción
          throw new Error(`Error al obtener resultados (${response.status})`);
        }
        
        // Si llegamos aquí, la respuesta fue exitosa - resetear contador de 502s
        consecutive502s = 0;
        const result = await response.json();

        if (result.analysis) {
          setAnalysisResult(result);
          setAnalyzing(false);
          setPolling(false);
          setProgress(100);
          setStatusLabel("Completado");
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 3000); // Poll cada 3 segundos
        } else {
          setError("El análisis está tomando más tiempo del esperado. Intenta más tarde.");
          setAnalyzing(false);
          setPolling(false);
        }
      } catch (err: any) {
        // Solo detener si no es un 502 (ya manejado arriba)
        if (!err.message?.includes("502")) {
        setError(err.message || "Error al obtener resultados");
        setAnalyzing(false);
        setPolling(false);
        } else if (attempts < maxAttempts) {
          // Si es un 502 y aún tenemos intentos, continuar
          attempts++;
          setTimeout(poll, 5000);
        } else {
          setError("El servicio no está respondiendo. Por favor, intenta más tarde.");
        setAnalyzing(false);
        setPolling(false);
        }
      }
    };

    poll();
  };

  return (
    <div className="space-y-8">
      {/* Sección de subir documento */}
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
                <Sparkles className="h-5 w-5" />
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

        {/* Documentos Sugeridos - Solo mostrar cuando hay análisis */}
        <DocumentosSugeridosPanel analysisResult={analysisResult} />
      </div>

      {/* Panel de progreso del análisis */}
      {analyzing && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="font-bold text-lg text-gray-900 mb-4">Analizando documento...</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 10 ? "bg-green-500" : "bg-gray-300"
              }`}>
                {progress >= 10 && <CheckCircle2 className="h-4 w-4 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Extrayendo texto y preparando análisis...
                </p>
                {progress < 10 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${progress}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 25 ? "bg-green-500" : progress >= 10 ? "bg-amber-500" : "bg-gray-300"
              }`}>
                {progress >= 25 ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : progress >= 10 ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Traduciendo y estructurando cláusulas...
                </p>
                {progress >= 10 && progress < 25 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${((progress - 10) / 15) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 40 ? "bg-green-500" : progress >= 25 ? "bg-amber-500" : "bg-gray-300"
              }`}>
                {progress >= 40 ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : progress >= 25 ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Clasificando tipo de documento...
                </p>
                {progress >= 25 && progress < 40 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${((progress - 25) / 15) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 60 ? "bg-green-500" : progress >= 40 ? "bg-amber-500" : "bg-gray-300"
              }`}>
                {progress >= 60 ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : progress >= 40 ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Analizando cláusulas específicas...
                </p>
                {progress >= 40 && progress < 60 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${((progress - 40) / 20) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 80 ? "bg-green-500" : progress >= 60 ? "bg-amber-500" : "bg-gray-300"
              }`}>
                {progress >= 80 ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : progress >= 60 ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Generando reporte final...
                </p>
                {progress >= 60 && progress < 80 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${((progress - 60) / 20) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                progress >= 100 ? "bg-green-500" : progress >= 80 ? "bg-amber-500" : "bg-gray-300"
              }`}>
                {progress >= 100 ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : progress >= 80 ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Guardando resultados...
                </p>
                {progress >= 80 && progress < 100 && (
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C026D3] rounded-full" style={{ width: `${((progress - 80) / 20) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AnalysisResultPanel 
        analysisResult={analysisResult} 
        analyzing={analyzing} 
        documentId={documentId}
      />
    </div>
  );
}

// Componente para mostrar y generar documentos sugeridos
function DocumentosSugeridosPanel({ analysisResult }: { analysisResult: any }) {
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<{ tipo: string; contenido: string } | null>(null);
  const API = useMemo(() => getApiUrl(), []);

  // Parsear el report
  const report = useMemo(() => {
    if (!analysisResult?.analysis?.report) return null;
    const r = analysisResult.analysis.report;
    if (typeof r === 'string') {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    }
    return r;
  }, [analysisResult]);

  const documentosSugeridos = report?.documentos_sugeridos || [];

  const handleGenerateDocument = async (doc: { tipo: string; descripcion: string }) => {
    setGeneratingDoc(doc.tipo);
    setGeneratedDoc(null);

    try {
      const response = await fetch(`${API}/api/generate-suggested-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoDocumento: doc.tipo,
          descripcion: doc.descripcion,
          contextoAnalisis: report?.texto_formateado || "",
          tipoDocumentoAnalizado: report?.tipo_documento || "",
          jurisdiccion: report?.jurisdiccion || "",
          areaLegal: report?.area_legal || "",
          citas: report?.citas || []
        })
      });

      if (!response.ok) {
        throw new Error("Error al generar documento");
      }

      const data = await response.json();
      setGeneratedDoc({ tipo: doc.tipo, contenido: data.documento || data.contenido || "Sin contenido" });
    } catch (err) {
      console.error("Error generando documento:", err);
      setGeneratedDoc({ tipo: doc.tipo, contenido: "Error al generar el documento. Intenta de nuevo." });
    } finally {
      setGeneratingDoc(null);
    }
  };

  if (documentosSugeridos.length === 0) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#C026D3]" />
        Documentos Sugeridos
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Basados en el análisis, se sugieren los siguientes documentos. Hacé click para generar la redacción.
      </p>
      
      <div className="space-y-2">
        {documentosSugeridos.map((doc: any, i: number) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 hover:border-[#C026D3]/40 transition">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{doc.tipo}</p>
                <p className="text-xs text-gray-500">{doc.descripcion}</p>
              </div>
              <button
                onClick={() => handleGenerateDocument(doc)}
                disabled={generatingDoc === doc.tipo}
                className="ml-3 px-3 py-1.5 bg-[#C026D3] text-white text-xs font-medium rounded-lg hover:bg-[#A21CAF] disabled:opacity-50 flex items-center gap-1"
              >
                {generatingDoc === doc.tipo ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Generar
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal/Panel para mostrar documento generado */}
      {generatedDoc && (
        <div className="mt-4 border border-[#C026D3]/30 rounded-lg bg-purple-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold text-gray-900">{generatedDoc.tipo}</h5>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedDoc.contenido);
                }}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                📋 Copiar
              </button>
              <button
                onClick={() => setGeneratedDoc(null)}
                className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 max-h-[400px] overflow-y-auto whitespace-pre-wrap">
            {generatedDoc.contenido}
          </div>
        </div>
      )}
    </div>
  );
}

// Componente para mostrar el resultado del análisis con secciones
function AnalysisResultPanel({ analysisResult, analyzing, documentId }: { 
  analysisResult: any; 
  analyzing: boolean;
  documentId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"resumen" | "clausulas" | "riesgos" | "recomendaciones" | "fuentes" | "chat">("resumen");
  const [chatMessages, setChatMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const API = useMemo(() => getApiUrl(), []);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Parsear el report si es string JSON
  const report = useMemo(() => {
    if (!analysisResult?.analysis?.report) return null;
    const r = analysisResult.analysis.report;
    if (typeof r === 'string') {
      try {
        return JSON.parse(r);
      } catch {
        // Si no es JSON, devolver estructura con texto_formateado
        return { texto_formateado: r };
      }
    }
    return r;
  }, [analysisResult]);

  // Auto-scroll cuando cambian los mensajes o cuando termina de cargar
  useEffect(() => {
    if (chatMessagesEndRef.current && activeTab === "chat") {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatMessages, chatLoading, activeTab]);

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput.trim();
    setChatInput("");
    
    // Agregar mensaje del usuario al historial
    const newMessages = [...chatMessages, { role: "user" as const, content: userMessage }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      // Preparar citas en el formato correcto
      const citas = report?.citas?.map((c: any) => ({
        tipo: c.tipo || "otra",
        referencia: c.referencia || "",
        descripcion: c.descripcion,
        url: c.url
      })) || [];

      // Preparar riesgos
      const riesgos = report?.riesgos?.map((r: any) => ({
        descripcion: r.descripcion || "",
        nivel: r.nivel || "medio",
        recomendacion: r.recomendacion
      })) || [];

      // Usar endpoint específico para análisis de documentos
      const response = await fetch(`${API}/api/analysis/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Texto completo del análisis
          analysisText: report?.texto_formateado || (typeof analysisResult?.analysis?.report === 'string' ? analysisResult.analysis.report : JSON.stringify(analysisResult?.analysis?.report)),
          // Historial de mensajes
          messages: newMessages,
          // Metadata del documento
          areaLegal: report?.area_legal || "",
          jurisdiccion: report?.jurisdiccion || "",
          tipoDocumento: report?.tipo_documento || analysisResult?.analysis?.type || "",
          // Citas y riesgos para contexto
          citas: citas,
          riesgos: riesgos
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en el chat: ${errorText}`);
      }
      
      const data = await response.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.message || "Sin respuesta" }]);
    } catch (err: any) {
      console.error("Error en chat:", err);
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error al procesar tu consulta: ${err.message || "Intenta de nuevo."}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (!analysisResult?.analysis) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-2">Resultado del Análisis</h3>
        <p className="text-sm text-gray-500 mb-6">Esperando análisis...</p>
        {analyzing ? (
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
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-4">
            <div>
          <h3 className="font-bold text-lg text-gray-900">Resultado del Análisis</h3>
          <p className="text-sm text-gray-500">
            {report?.tipo_documento || analysisResult.analysis.type} • {report?.jurisdiccion || "Nacional"} • {report?.area_legal || ""}
          </p>
        </div>
            </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b border-gray-200">
        {[
          { id: "resumen", label: "Resumen" },
          { id: "clausulas", label: "Cláusulas" },
          { id: "riesgos", label: "Riesgos" },
          { id: "recomendaciones", label: "Recomendaciones" },
          { id: "fuentes", label: "Fuentes" },
          { id: "chat", label: "💬 Chat" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-[#C026D3] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {activeTab === "resumen" && (
          <div className="space-y-4">
              <div>
              <h4 className="font-semibold text-gray-900 mb-2">{report?.titulo || "Análisis del Documento"}</h4>
              <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                {report?.resumen_ejecutivo || report?.texto_formateado || analysisResult.analysis.report}
              </div>
            </div>
            {report?.analisis_juridico && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Análisis Jurídico</h4>
                <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                  {report.analisis_juridico}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "clausulas" && (
          <div className="space-y-3">
            {report?.clausulas_analizadas?.length > 0 ? (
              report.clausulas_analizadas.map((clausula: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {clausula.numero} - {clausula.titulo}
                    </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                      clausula.riesgo === "alto" ? "bg-red-100 text-red-800" :
                      clausula.riesgo === "medio" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      Riesgo: {clausula.riesgo}
                        </span>
                      </div>
                  <p className="text-sm text-gray-600">{clausula.analisis}</p>
                </div>
              ))
            ) : analysisResult.analysis.checklist?.items ? (
              analysisResult.analysis.checklist.items.map((item: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900">{item.key}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                        item.risk === "high" ? "bg-red-100 text-red-800" :
                        item.risk === "medium" ? "bg-yellow-100 text-yellow-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        Riesgo: {item.risk}
                    </span>
                      </div>
                  {item.comment && <p className="text-xs text-gray-600 mt-2">{item.comment}</p>}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No hay cláusulas analizadas</p>
                      )}
                    </div>
        )}

        {activeTab === "riesgos" && (
          <div className="space-y-3">
            {report?.riesgos?.length > 0 ? (
              report.riesgos.map((riesgo: any, i: number) => (
                <div key={i} className={`border-l-4 p-4 rounded-r-lg ${
                  riesgo.nivel === "alto" ? "border-red-500 bg-red-50" :
                  riesgo.nivel === "medio" ? "border-yellow-500 bg-yellow-50" :
                  "border-green-500 bg-green-50"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">⚠️</span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      riesgo.nivel === "alto" ? "bg-red-200 text-red-800" :
                      riesgo.nivel === "medio" ? "bg-yellow-200 text-yellow-800" :
                      "bg-green-200 text-green-800"
                    }`}>
                      {riesgo.nivel?.toUpperCase()}
                    </span>
                </div>
                  <p className="text-sm text-gray-800 font-medium mb-1">{riesgo.descripcion}</p>
                  {riesgo.recomendacion && (
                    <p className="text-sm text-gray-600">💡 {riesgo.recomendacion}</p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No se identificaron riesgos específicos</p>
            )}
              </div>
            )}

        {activeTab === "recomendaciones" && (
          <div className="space-y-4">
            {report?.recomendaciones?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Recomendaciones</h4>
                <ul className="space-y-2">
                  {report.recomendaciones.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-[#C026D3]">✓</span>
                      {rec}
                    </li>
                  ))}
                </ul>
                </div>
            )}
            {report?.proximos_pasos?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Próximos Pasos</h4>
                <ul className="space-y-2">
                  {report.proximos_pasos.map((paso: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-blue-600">{i + 1}.</span>
                      {paso}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report?.documentos_sugeridos?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Documentos Sugeridos</h4>
                <div className="space-y-2">
                  {report.documentos_sugeridos.map((doc: any, i: number) => (
                    <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900">{doc.tipo}</p>
                      <p className="text-xs text-blue-700">{doc.descripcion}</p>
          </div>
                  ))}
          </div>
              </div>
            )}
            {!report?.recomendaciones?.length && !report?.proximos_pasos?.length && (
              <p className="text-sm text-gray-500 text-center py-8">No hay recomendaciones disponibles</p>
            )}
          </div>
        )}

        {activeTab === "fuentes" && (
          <div className="space-y-3">
            {report?.citas?.length > 0 ? (
              report.citas.map((cita: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      cita.tipo === "normativa" ? "bg-blue-100 text-blue-800" :
                      cita.tipo === "jurisprudencia" ? "bg-purple-100 text-purple-800" :
                      cita.tipo === "doctrina" ? "bg-green-100 text-green-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {cita.tipo}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{cita.referencia}</p>
                  {cita.descripcion && <p className="text-xs text-gray-600 mt-1">{cita.descripcion}</p>}
                  {cita.url && (
                    <a 
                      href={cita.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-[#C026D3] hover:underline mt-1 inline-block"
                    >
                      🔗 Ver fuente
                    </a>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No hay fuentes citadas</p>
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <div className="flex flex-col h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">💬 Chat con Asistente</p>
                  <p className="text-xs text-gray-400">Hacé preguntas sobre el documento analizado</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                      msg.role === "user" 
                        ? "bg-[#C026D3] text-white" 
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSubmit()}
                placeholder="Preguntá sobre el documento..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C026D3]"
              />
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim() || chatLoading}
                className="bg-[#C026D3] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#A21CAF] disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
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

// Definición de plantillas de documentos
const PLANTILLAS_DOCUMENTOS = [
  {
    id: "locacion",
    nombre: "Contrato de Locación",
    descripcion: "Alquiler de inmuebles residenciales o comerciales",
    campos: [
      { id: "locador", label: "Nombre del Locador", tipo: "text", placeholder: "Juan Pérez" },
      { id: "locador_dni", label: "DNI del Locador", tipo: "text", placeholder: "12.345.678" },
      { id: "locador_domicilio", label: "Domicilio del Locador", tipo: "text", placeholder: "Av. Corrientes 1234, CABA" },
      { id: "locatario", label: "Nombre del Locatario", tipo: "text", placeholder: "María García" },
      { id: "locatario_dni", label: "DNI del Locatario", tipo: "text", placeholder: "23.456.789" },
      { id: "locatario_domicilio", label: "Domicilio del Locatario", tipo: "text", placeholder: "Av. Santa Fe 5678, CABA" },
      { id: "inmueble", label: "Dirección del Inmueble", tipo: "text", placeholder: "Calle Falsa 123, Piso 4, Depto A" },
      { id: "destino", label: "Destino (vivienda/comercial)", tipo: "select", opciones: ["Vivienda única y permanente", "Comercial", "Profesional"] },
      { id: "plazo", label: "Plazo (meses)", tipo: "number", placeholder: "36" },
      { id: "precio", label: "Precio mensual inicial", tipo: "text", placeholder: "$150.000" },
      { id: "ajuste", label: "Índice de ajuste", tipo: "select", opciones: ["ICL (Índice de Contratos de Locación)", "IPC", "Otro a convenir"] },
      { id: "deposito", label: "Depósito en garantía", tipo: "text", placeholder: "1 mes de alquiler" },
    ]
  },
  {
    id: "trabajo",
    nombre: "Contrato de Trabajo",
    descripcion: "Relación laboral en relación de dependencia",
    campos: [
      { id: "empleador", label: "Razón Social del Empleador", tipo: "text", placeholder: "Empresa S.A." },
      { id: "empleador_cuit", label: "CUIT del Empleador", tipo: "text", placeholder: "30-12345678-9" },
      { id: "empleador_domicilio", label: "Domicilio del Empleador", tipo: "text", placeholder: "Av. Libertador 1000, CABA" },
      { id: "empleado", label: "Nombre del Empleado", tipo: "text", placeholder: "Carlos López" },
      { id: "empleado_dni", label: "DNI del Empleado", tipo: "text", placeholder: "34.567.890" },
      { id: "empleado_domicilio", label: "Domicilio del Empleado", tipo: "text", placeholder: "Calle 10 N° 500, La Plata" },
      { id: "puesto", label: "Puesto/Categoría", tipo: "text", placeholder: "Analista Senior" },
      { id: "tareas", label: "Descripción de Tareas", tipo: "textarea", placeholder: "Análisis de datos, elaboración de informes..." },
      { id: "remuneracion", label: "Remuneración Bruta Mensual", tipo: "text", placeholder: "$500.000" },
      { id: "jornada", label: "Jornada Laboral", tipo: "select", opciones: ["Tiempo completo (8hs)", "Tiempo parcial (4hs)", "Otro"] },
      { id: "modalidad", label: "Modalidad", tipo: "select", opciones: ["Presencial", "Remoto", "Híbrido"] },
      { id: "convenio", label: "Convenio Colectivo Aplicable", tipo: "text", placeholder: "CCT 130/75 Comercio" },
    ]
  },
  {
    id: "nda",
    nombre: "Acuerdo de Confidencialidad (NDA)",
    descripcion: "Protección de información confidencial entre partes",
    campos: [
      { id: "parte_reveladora", label: "Parte Reveladora", tipo: "text", placeholder: "Tech Solutions S.A." },
      { id: "parte_reveladora_cuit", label: "CUIT Parte Reveladora", tipo: "text", placeholder: "30-12345678-9" },
      { id: "parte_receptora", label: "Parte Receptora", tipo: "text", placeholder: "Consultor Externo S.R.L." },
      { id: "parte_receptora_cuit", label: "CUIT Parte Receptora", tipo: "text", placeholder: "30-98765432-1" },
      { id: "objeto", label: "Objeto/Propósito del NDA", tipo: "textarea", placeholder: "Evaluación de potencial alianza comercial..." },
      { id: "info_confidencial", label: "Tipo de Información Confidencial", tipo: "textarea", placeholder: "Datos técnicos, financieros, comerciales, know-how..." },
      { id: "vigencia", label: "Vigencia (años)", tipo: "number", placeholder: "3" },
      { id: "jurisdiccion", label: "Jurisdicción", tipo: "text", placeholder: "Tribunales de la Ciudad de Buenos Aires" },
    ]
  },
  {
    id: "servicios",
    nombre: "Contrato de Prestación de Servicios",
    descripcion: "Servicios profesionales independientes (no relación de dependencia)",
    campos: [
      { id: "cliente", label: "Cliente (Contratante)", tipo: "text", placeholder: "Empresa Contratante S.A." },
      { id: "cliente_cuit", label: "CUIT del Cliente", tipo: "text", placeholder: "30-12345678-9" },
      { id: "prestador", label: "Prestador del Servicio", tipo: "text", placeholder: "Profesional Independiente" },
      { id: "prestador_cuit", label: "CUIT/CUIL del Prestador", tipo: "text", placeholder: "20-12345678-9" },
      { id: "servicio", label: "Descripción del Servicio", tipo: "textarea", placeholder: "Consultoría en sistemas, desarrollo de software..." },
      { id: "honorarios", label: "Honorarios", tipo: "text", placeholder: "$200.000 mensuales + IVA" },
      { id: "forma_pago", label: "Forma de Pago", tipo: "text", placeholder: "Mensual, dentro de los 10 días de presentada la factura" },
      { id: "plazo", label: "Plazo del Contrato", tipo: "text", placeholder: "12 meses" },
      { id: "preaviso", label: "Preaviso para Rescisión", tipo: "text", placeholder: "30 días" },
    ]
  },
  {
    id: "poder",
    nombre: "Poder General/Especial",
    descripcion: "Otorgamiento de facultades de representación",
    campos: [
      { id: "poderdante", label: "Poderdante (quien otorga)", tipo: "text", placeholder: "Juan Pérez" },
      { id: "poderdante_dni", label: "DNI del Poderdante", tipo: "text", placeholder: "12.345.678" },
      { id: "poderdante_domicilio", label: "Domicilio del Poderdante", tipo: "text", placeholder: "Av. Corrientes 1234, CABA" },
      { id: "apoderado", label: "Apoderado (quien recibe)", tipo: "text", placeholder: "Dr. Carlos Abogado" },
      { id: "apoderado_dni", label: "DNI del Apoderado", tipo: "text", placeholder: "23.456.789" },
      { id: "tipo_poder", label: "Tipo de Poder", tipo: "select", opciones: ["General de Administración", "Especial para Juicio", "Especial para Venta de Inmueble", "Especial para Trámites Bancarios"] },
      { id: "facultades", label: "Facultades Específicas", tipo: "textarea", placeholder: "Representar en juicio, cobrar, percibir, dar recibos..." },
      { id: "vigencia", label: "Vigencia", tipo: "select", opciones: ["Hasta revocación", "1 año", "2 años", "Acto específico"] },
    ]
  },
  {
    id: "compraventa",
    nombre: "Contrato de Compraventa",
    descripcion: "Venta de bienes muebles o inmuebles",
    campos: [
      { id: "vendedor", label: "Vendedor", tipo: "text", placeholder: "Vendedor S.A." },
      { id: "vendedor_cuit", label: "CUIT/DNI del Vendedor", tipo: "text", placeholder: "30-12345678-9" },
      { id: "comprador", label: "Comprador", tipo: "text", placeholder: "Comprador S.R.L." },
      { id: "comprador_cuit", label: "CUIT/DNI del Comprador", tipo: "text", placeholder: "30-98765432-1" },
      { id: "tipo_bien", label: "Tipo de Bien", tipo: "select", opciones: ["Inmueble", "Automotor", "Muebles/Equipos", "Fondo de Comercio"] },
      { id: "descripcion_bien", label: "Descripción del Bien", tipo: "textarea", placeholder: "Departamento de 3 ambientes ubicado en..." },
      { id: "precio", label: "Precio de Venta", tipo: "text", placeholder: "USD 100.000" },
      { id: "forma_pago", label: "Forma de Pago", tipo: "textarea", placeholder: "50% a la firma, 50% contra escritura..." },
      { id: "entrega", label: "Fecha/Condiciones de Entrega", tipo: "text", placeholder: "A los 30 días de la firma" },
    ]
  },
  {
    id: "carta_documento",
    nombre: "Carta Documento",
    descripcion: "Intimaciones, notificaciones y reclamos formales",
    campos: [
      { id: "remitente", label: "Remitente", tipo: "text", placeholder: "Juan Pérez" },
      { id: "remitente_dni", label: "DNI/CUIT del Remitente", tipo: "text", placeholder: "12.345.678" },
      { id: "remitente_domicilio", label: "Domicilio del Remitente", tipo: "text", placeholder: "Av. Corrientes 1234, CABA" },
      { id: "destinatario", label: "Destinatario", tipo: "text", placeholder: "Empresa Deudora S.A." },
      { id: "destinatario_domicilio", label: "Domicilio del Destinatario", tipo: "text", placeholder: "Av. Libertador 5678, CABA" },
      { id: "tipo_intimacion", label: "Tipo de Intimación", tipo: "select", opciones: ["Pago de deuda", "Cumplimiento de contrato", "Cese de conducta", "Reclamo laboral", "Desalojo", "Otro"] },
      { id: "hechos", label: "Hechos/Antecedentes", tipo: "textarea", placeholder: "Con fecha X se celebró contrato... hasta la fecha no se ha cumplido..." },
      { id: "plazo_intimacion", label: "Plazo para Cumplir", tipo: "text", placeholder: "48 horas" },
      { id: "consecuencias", label: "Consecuencias por Incumplimiento", tipo: "textarea", placeholder: "Se iniciarán acciones legales, se reclamarán daños y perjuicios..." },
    ]
  },
  {
    id: "sociedad",
    nombre: "Contrato de Sociedad (SAS/SRL)",
    descripcion: "Constitución de sociedad comercial",
    campos: [
      { id: "tipo_sociedad", label: "Tipo de Sociedad", tipo: "select", opciones: ["SAS (Sociedad por Acciones Simplificada)", "SRL (Sociedad de Responsabilidad Limitada)", "SA (Sociedad Anónima)"] },
      { id: "denominacion", label: "Denominación Social", tipo: "text", placeholder: "Nueva Empresa S.A.S." },
      { id: "objeto", label: "Objeto Social", tipo: "textarea", placeholder: "Desarrollo de software, consultoría informática..." },
      { id: "capital", label: "Capital Social", tipo: "text", placeholder: "$1.000.000" },
      { id: "socios", label: "Socios y Participación", tipo: "textarea", placeholder: "Juan Pérez (50%), María García (50%)" },
      { id: "domicilio_social", label: "Domicilio Social", tipo: "text", placeholder: "Av. Corrientes 1234, CABA" },
      { id: "duracion", label: "Duración", tipo: "text", placeholder: "99 años" },
      { id: "administracion", label: "Administración", tipo: "textarea", placeholder: "Administrador único: Juan Pérez" },
      { id: "ejercicio", label: "Cierre de Ejercicio", tipo: "text", placeholder: "31 de diciembre" },
    ]
  },
  {
    id: "acuerdo_partes",
    nombre: "Acuerdo de Partes / Transacción",
    descripcion: "Acuerdo para resolver conflictos o establecer condiciones",
    campos: [
      { id: "parte_a", label: "Primera Parte", tipo: "text", placeholder: "Juan Pérez / Empresa A S.A." },
      { id: "parte_a_datos", label: "Datos de Primera Parte (DNI/CUIT)", tipo: "text", placeholder: "DNI 12.345.678" },
      { id: "parte_b", label: "Segunda Parte", tipo: "text", placeholder: "María García / Empresa B S.R.L." },
      { id: "parte_b_datos", label: "Datos de Segunda Parte (DNI/CUIT)", tipo: "text", placeholder: "CUIT 30-12345678-9" },
      { id: "antecedentes", label: "Antecedentes del Conflicto/Situación", tipo: "textarea", placeholder: "Las partes mantienen un conflicto respecto de..." },
      { id: "acuerdos", label: "Puntos Acordados", tipo: "textarea", placeholder: "1) La Parte A pagará $X... 2) La Parte B desistirá de..." },
      { id: "confidencialidad", label: "Cláusula de Confidencialidad", tipo: "select", opciones: ["Sí, confidencial", "No, público"] },
      { id: "jurisdiccion", label: "Jurisdicción", tipo: "text", placeholder: "Tribunales de la Ciudad de Buenos Aires" },
    ]
  },
  {
    id: "mutuo",
    nombre: "Contrato de Mutuo (Préstamo)",
    descripcion: "Préstamo de dinero entre partes",
    campos: [
      { id: "mutuante", label: "Mutuante (quien presta)", tipo: "text", placeholder: "Banco/Persona que presta" },
      { id: "mutuante_cuit", label: "CUIT/DNI del Mutuante", tipo: "text", placeholder: "30-12345678-9" },
      { id: "mutuario", label: "Mutuario (quien recibe)", tipo: "text", placeholder: "Persona/Empresa que recibe" },
      { id: "mutuario_cuit", label: "CUIT/DNI del Mutuario", tipo: "text", placeholder: "20-12345678-9" },
      { id: "monto", label: "Monto del Préstamo", tipo: "text", placeholder: "$1.000.000 / USD 10.000" },
      { id: "moneda", label: "Moneda", tipo: "select", opciones: ["Pesos Argentinos", "Dólares Estadounidenses", "Otra"] },
      { id: "interes", label: "Tasa de Interés", tipo: "text", placeholder: "5% mensual / TNA 60%" },
      { id: "plazo", label: "Plazo de Devolución", tipo: "text", placeholder: "12 meses" },
      { id: "cuotas", label: "Forma de Pago", tipo: "text", placeholder: "12 cuotas mensuales de $X" },
      { id: "garantia", label: "Garantía", tipo: "textarea", placeholder: "Pagaré, hipoteca, prenda, fianza personal..." },
    ]
  }
];

function GenerarPanel({ onGenerated, setError, setLoading }: { onGenerated: (out: any)=>void; setError: (e:string|null)=>void; setLoading: (b:boolean)=>void; }) {
  const [modoGeneracion, setModoGeneracion] = useState<"memo" | "plantilla">("memo");
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
                    console.log("[DEBUG] Memo data recibido:", data);
                    console.log("[DEBUG] Puntos tratados:", data.puntos_tratados);
                    console.log("[DEBUG] Riesgos:", data.riesgos);
                    console.log("[DEBUG] Citas:", data.citas);
                    console.log("[DEBUG] Próximos pasos:", data.proximos_pasos);
                    setMemoResult(data);
                    // Convertir citas del memo al formato esperado por la bandeja
                    const citations = (data.citas || []).map((c: any) => ({
                      title: c.referencia || c.descripcion || "(sin título)",
                      source: c.tipo || "otra",
                      url: c.url || undefined,
                      descripcion: c.descripcion || undefined,
                      // Mantener también el formato original para compatibilidad
                      tipo: c.tipo || "otra",
                      referencia: c.referencia || c.descripcion || "(sin título)"
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
                        transcriptText: transcriptText || (file ? "PDF subido" : ""), // Guardar transcriptText para el chat
                        // Asegurar que las citas estén en memoData.citas también
                        citas: data.citas || []
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
      <h3 className="font-bold text-lg text-gray-900 mb-1">Generar Documento</h3>
      <p className="text-sm text-gray-500 mb-6">Guide for Normative - Jurisprudential agents</p>
      
      {/* Tabs para elegir modo */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setModoGeneracion("memo")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            modoGeneracion === "memo"
              ? "border-[#C026D3] text-[#C026D3]"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Memos / Dictámenes
        </button>
        <button
          type="button"
          onClick={() => setModoGeneracion("plantilla")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            modoGeneracion === "plantilla"
              ? "border-[#C026D3] text-[#C026D3]"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Contratos / Plantillas
        </button>
      </div>

      {modoGeneracion === "plantilla" ? (
        <GenerarDesdePlantilla onGenerated={onGenerated} setError={setError} setLoading={setLoading} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: Formulario */}
        <div className="space-y-4">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
              <select className="w-full bg-white border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-[#C026D3] focus:border-[#C026D3]" value={type} onChange={e=>setType(e.target.value as any)}>
                <option value="memo">Memo</option>
                <option value="dictamen">Dictamen</option>
                <option value="contrato">Contrato</option>
                <option value="escrito">Escrito</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Área legal</label>
              <select className="w-full bg-white border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-[#C026D3] focus:border-[#C026D3]" value={areaLegal} onChange={e=>setAreaLegal(e.target.value as any)}>
                <option value="civil_comercial">Civil, Comercial y Societario</option>
                <option value="laboral">Laboral</option>
                <option value="corporativo">Corporativo</option>
                <option value="compliance">Compliance</option>
                <option value="marcas">Marcas y Propiedad Intelectual</option>
                <option value="consumidor">Consumidor</option>
                <option value="traducir">Traducir</option>
              </select>
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
              <label className="ml-2 block text-sm text-gray-800" htmlFor="use-rag">Usar generador de memos sin RAG</label>
            </div>
            {file && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                <div className="text-blue-900 font-medium mb-1">💡 Modo Chat disponible</div>
                <div className="text-blue-700 text-xs">Con el archivo subido, también podés usar el modo chat para consultar paso a paso cómo proceder.</div>
              </div>
            )}
            <div className="flex items-center justify-end space-x-4 pt-4">
              <button 
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium" 
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
                Salir
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
                    <CheckCircle2 className="text-base" />
                    <span>Generar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Columna derecha: Preview del Dictamen */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="font-bold text-lg text-gray-900 mb-4">Dictamen Jurídico</h4>
          <div className="bg-white rounded-lg border border-gray-300 p-4 min-h-[400px] relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <span className="text-6xl font-bold text-gray-400">DRAFT</span>
            </div>
            <div className="relative z-10 space-y-4">
              {title && (
                <div>
                  <h5 className="font-semibold text-gray-900 mb-2">{title}</h5>
                </div>
              )}
              {instructions ? (
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  <p className="font-medium mb-2">1. Contexto y consulta</p>
                  <p className="text-gray-600">{instructions}</p>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">
                  <p className="font-medium mb-2">1. Contexto y consulta</p>
                  <p>Completá el formulario para ver el preview del dictamen...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Indicador de progreso moderno */}
        {loadingLocal && (
          <ProgressIndicator />
        )}

        {memoResult && (
          <MemoResultPanel memoResult={memoResult} />
        )}
      </div>
      )}
    </div>
  );
}

// Componente para mostrar el resultado del memo con pestañas
function MemoResultPanel({ memoResult }: { memoResult: any }) {
  const [activeTab, setActiveTab] = useState<"resumen" | "puntos" | "riesgos" | "recomendaciones" | "fuentes">("resumen");
  const [chatMessages, setChatMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const API = useMemo(() => getApiUrl(), []);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Debug: ver qué datos tenemos
  useEffect(() => {
    console.log("[MemoResultPanel] memoResult completo:", memoResult);
    console.log("[MemoResultPanel] puntos_tratados:", memoResult?.puntos_tratados);
    console.log("[MemoResultPanel] riesgos:", memoResult?.riesgos);
    console.log("[MemoResultPanel] citas:", memoResult?.citas);
    console.log("[MemoResultPanel] proximos_pasos:", memoResult?.proximos_pasos);
  }, [memoResult]);

  // Construir memoContent desde memoResult para el chat
  const memoContent = useMemo(() => {
    if (!memoResult) return null;
    return {
      content: memoResult.texto_formateado || memoResult.markdown || "",
      resumen: memoResult.resumen || "",
      titulo: memoResult.titulo || "Memo de Reunión",
      areaLegal: memoResult.areaLegal || "civil_comercial"
    };
  }, [memoResult]);

  // Auto-scroll cuando cambian los mensajes o cuando termina de cargar
  useEffect(() => {
    if (chatMessagesEndRef.current && memoContent) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatMessages, chatLoading, memoContent]);

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !memoContent) return;
    
    const userMessage = chatInput.trim();
    setChatInput("");
    
    const newMessages = [...chatMessages, { role: "user" as const, content: userMessage }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const response = await fetch(`${API}/api/memos/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: memoContent.content,
          messages: newMessages,
          areaLegal: memoContent.areaLegal
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en el chat: ${errorText}`);
      }
      
      const data = await response.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.message || "Sin respuesta" }]);
    } catch (err: any) {
      console.error("Error en chat:", err);
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error al procesar tu consulta: ${err.message || "Intenta de nuevo."}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="mt-4 bg-white p-6 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-4">
                <div>
          <h3 className="font-bold text-lg text-gray-900">Resultado del Memo</h3>
          <p className="text-sm text-gray-500">
            {memoResult.titulo || "Memo de Reunión"} • {memoResult.areaLegal?.replace(/_/g, " ") || ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b border-gray-200">
        {[
          { id: "resumen", label: "Resumen" },
          { id: "puntos", label: "Puntos Tratados" },
          { id: "riesgos", label: "Riesgos" },
          { id: "recomendaciones", label: "Recomendaciones" },
          { id: "fuentes", label: "Fuentes" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-[#C026D3] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {activeTab === "resumen" && (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">{memoResult.titulo || memoResult.titulo || "Memo de Reunión"}</h4>
              <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                {memoResult.resumen || "Sin resumen disponible"}
              </div>
            </div>
            {memoResult.texto_formateado && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Texto Completo</h4>
                <div className="text-sm text-gray-700 bg-white border border-gray-200 p-4 rounded-lg whitespace-pre-wrap font-mono max-h-[600px] overflow-y-auto">
                  {memoResult.texto_formateado}
                </div>
                <button
                  className="mt-2 text-xs text-[#C026D3] hover:underline"
                  onClick={() => {
                    navigator.clipboard.writeText(memoResult.texto_formateado);
                    alert("Texto copiado al portapapeles");
                  }}
                >
                  📋 Copiar texto completo
                </button>
                </div>
              )}
          </div>
        )}

        {activeTab === "puntos" && (
          <div className="space-y-3">
            {(memoResult.puntos_tratados && Array.isArray(memoResult.puntos_tratados) && memoResult.puntos_tratados.length > 0) ? (
              memoResult.puntos_tratados.map((punto: string, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-[#C026D3] font-bold">{i + 1}.</span>
                    <p className="text-sm text-gray-700 flex-1">{punto}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                {memoResult.puntos_tratados ? "No hay puntos tratados" : "Puntos tratados no disponibles"}
              </p>
            )}
          </div>
        )}

        {activeTab === "riesgos" && (
          <div className="space-y-3">
            {(memoResult.riesgos && Array.isArray(memoResult.riesgos) && memoResult.riesgos.length > 0) ? (
              memoResult.riesgos.map((riesgo: string | any, i: number) => {
                const riesgoText = typeof riesgo === "string" ? riesgo : (riesgo.descripcion || riesgo.texto || riesgo);
                const nivel = typeof riesgo === "object" && riesgo.nivel ? riesgo.nivel : "medio";
                return (
                  <div key={i} className={`border-l-4 p-4 rounded-r-lg ${
                    nivel === "alto" ? "border-red-500 bg-red-50" :
                    nivel === "medio" ? "border-yellow-500 bg-yellow-50" :
                    "border-green-500 bg-green-50"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">⚠️</span>
                      {typeof riesgo === "object" && riesgo.nivel && (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          riesgo.nivel === "alto" ? "bg-red-200 text-red-800" :
                          riesgo.nivel === "medio" ? "bg-yellow-200 text-yellow-800" :
                          "bg-green-200 text-green-800"
                        }`}>
                          {riesgo.nivel.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{riesgoText}</p>
                    {typeof riesgo === "object" && riesgo.recomendacion && (
                      <p className="text-sm text-gray-600 mt-2">💡 {riesgo.recomendacion}</p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                {memoResult.riesgos ? "No se identificaron riesgos específicos" : "Riesgos no disponibles"}
              </p>
            )}
          </div>
        )}

        {activeTab === "recomendaciones" && (
          <div className="space-y-4">
            {(memoResult.recomendaciones && Array.isArray(memoResult.recomendaciones) && memoResult.recomendaciones.length > 0) && (
                <div>
                <h4 className="font-semibold text-gray-900 mb-3">Recomendaciones</h4>
                <ul className="space-y-2">
                  {memoResult.recomendaciones.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-[#C026D3]">✓</span>
                      {rec}
                    </li>
                    ))}
                  </ul>
                </div>
              )}
            {(memoResult.proximos_pasos && Array.isArray(memoResult.proximos_pasos) && memoResult.proximos_pasos.length > 0) && (
                <div>
                <h4 className="font-semibold text-gray-900 mb-3">Próximos Pasos</h4>
                <ul className="space-y-2">
                  {memoResult.proximos_pasos.map((paso: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-blue-600">{i + 1}.</span>
                      {paso}
                    </li>
                    ))}
                  </ul>
                </div>
              )}
            {(!memoResult.recomendaciones || !Array.isArray(memoResult.recomendaciones) || memoResult.recomendaciones.length === 0) && 
             (!memoResult.proximos_pasos || !Array.isArray(memoResult.proximos_pasos) || memoResult.proximos_pasos.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-8">No hay recomendaciones disponibles</p>
              )}
            </div>
        )}

        {activeTab === "fuentes" && (
          <div className="space-y-3">
            {(memoResult.citas && Array.isArray(memoResult.citas) && memoResult.citas.length > 0) ? (
              memoResult.citas.map((cita: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      cita.tipo === "normativa" || cita.source === "normativa" ? "bg-blue-100 text-blue-800" :
                      cita.tipo === "jurisprudencia" || cita.source === "jurisprudencia" ? "bg-purple-100 text-purple-800" :
                      cita.tipo === "doctrina" || cita.source === "doctrina" ? "bg-green-100 text-green-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {cita.tipo || cita.source || "otra"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{cita.referencia || cita.title || cita.descripcion || "Sin referencia"}</p>
                  {cita.descripcion && (cita.referencia || cita.title) && <p className="text-xs text-gray-600 mt-1">{cita.descripcion}</p>}
                  {cita.url && (
                    <a 
                      href={cita.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-[#C026D3] hover:underline mt-1 inline-block"
                    >
                      🔗 Ver fuente
                    </a>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                {memoResult.citas ? "No hay fuentes citadas" : "Fuentes no disponibles"}
              </p>
            )}
          </div>
        )}

      </div>

      {/* Chat debajo del contenido */}
      {memoContent && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>💬</span>
            <span>Chat sobre esta reunión</span>
          </h4>
          <div className="flex flex-col h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">💬 Chat con Asistente</p>
                  <p className="text-xs text-gray-400">Hacé preguntas sobre el memo generado</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                      msg.role === "user" 
                        ? "bg-[#C026D3] text-white" 
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSubmit()}
                placeholder="Preguntá sobre el memo..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C026D3]"
                disabled={!memoContent || chatLoading}
              />
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim() || chatLoading || !memoContent}
                className="bg-[#C026D3] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#A21CAF] disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente para generar documentos desde plantillas
function GenerarDesdePlantilla({ onGenerated, setError, setLoading }: { onGenerated: (out: any)=>void; setError: (e:string|null)=>void; setLoading: (b:boolean)=>void; }) {
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<typeof PLANTILLAS_DOCUMENTOS[0] | null>(null);
  const [camposValores, setCamposValores] = useState<Record<string, string>>({});
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const API = useMemo(() => getApiUrl(), []);

  const handleSelectPlantilla = (plantilla: typeof PLANTILLAS_DOCUMENTOS[0]) => {
    setPlantillaSeleccionada(plantilla);
    setCamposValores({});
    setResultado(null);
  };

  const handleCampoChange = (campoId: string, valor: string) => {
    setCamposValores(prev => ({ ...prev, [campoId]: valor }));
  };

  const handleGenerar = async () => {
    if (!plantillaSeleccionada || !API) return;
    
    // Verificar campos requeridos
    const camposFaltantes = plantillaSeleccionada.campos.filter(c => !camposValores[c.id]?.trim());
    if (camposFaltantes.length > 0) {
      setError(`Faltan completar: ${camposFaltantes.map(c => c.label).join(", ")}`);
      return;
    }

    setLoadingLocal(true);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API}/api/generate-from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: plantillaSeleccionada.id,
          templateName: plantillaSeleccionada.nombre,
          campos: camposValores
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}`);
      }

      const data = await response.json();
      setResultado(data.documento);
      
      onGenerated({
        id: crypto.randomUUID(),
        type: "contrato",
        title: `${plantillaSeleccionada.nombre} - ${new Date().toLocaleDateString()}`,
        markdown: data.documento,
        createdAt: new Date().toISOString()
      });

    } catch (e: any) {
      setError(e.message || "Error al generar documento");
    } finally {
      setLoadingLocal(false);
      setLoading(false);
    }
  };

  // Vista de selección de plantilla
  if (!plantillaSeleccionada) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 mb-4">Seleccioná una plantilla para comenzar:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PLANTILLAS_DOCUMENTOS.map((plantilla) => (
            <button
              key={plantilla.id}
              onClick={() => handleSelectPlantilla(plantilla)}
              className="p-4 border border-gray-200 rounded-lg hover:border-[#C026D3] hover:bg-[#C026D3]/5 transition-all text-left group"
            >
              <div className="font-medium text-gray-900 group-hover:text-[#C026D3]">{plantilla.nombre}</div>
              <div className="text-xs text-gray-500 mt-1">{plantilla.descripcion}</div>
            </button>
          ))}
                </div>
      </div>
    );
  }

  // Vista de formulario de plantilla
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
                <div>
          <h4 className="font-medium text-gray-900">{plantillaSeleccionada.nombre}</h4>
          <p className="text-xs text-gray-500">{plantillaSeleccionada.descripcion}</p>
                </div>
        <button
          onClick={() => {
            setPlantillaSeleccionada(null);
            setCamposValores({});
            setResultado(null);
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Cambiar plantilla
        </button>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3 max-h-[400px] overflow-y-auto">
        {plantillaSeleccionada.campos.map((campo) => (
          <div key={campo.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{campo.label}</label>
            {campo.tipo === "textarea" ? (
              <textarea
                className="w-full bg-gray-50 border border-gray-300 rounded-md text-sm p-2 focus:ring-[#C026D3] focus:border-[#C026D3]"
                placeholder={campo.placeholder}
                rows={3}
                value={camposValores[campo.id] || ""}
                onChange={(e) => handleCampoChange(campo.id, e.target.value)}
              />
            ) : campo.tipo === "select" ? (
              <select
                className="w-full bg-gray-50 border border-gray-300 rounded-md text-sm p-2 focus:ring-[#C026D3] focus:border-[#C026D3]"
                value={camposValores[campo.id] || ""}
                onChange={(e) => handleCampoChange(campo.id, e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {campo.opciones?.map((opcion) => (
                  <option key={opcion} value={opcion}>{opcion}</option>
                ))}
              </select>
            ) : (
              <input
                type={campo.tipo}
                className="w-full bg-gray-50 border border-gray-300 rounded-md text-sm p-2 focus:ring-[#C026D3] focus:border-[#C026D3]"
                placeholder={campo.placeholder}
                value={camposValores[campo.id] || ""}
                onChange={(e) => handleCampoChange(campo.id, e.target.value)}
              />
            )}
                </div>
        ))}
                </div>

      <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setCamposValores({})}
          className="flex items-center space-x-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium"
          disabled={loadingLocal}
        >
          <X className="text-base" />
          <span>Limpiar</span>
        </button>
        <button
          onClick={handleGenerar}
          disabled={loadingLocal}
          className="flex items-center space-x-2 bg-[#C026D3] text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-[#A21CAF] transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingLocal ? (
            <>
              <Loader2 className="text-base animate-spin" />
              <span>Generando...</span>
            </>
          ) : (
            <>
              <Send className="text-base" />
              <span>Generar Documento</span>
            </>
          )}
        </button>
            </div>

      {loadingLocal && <ProgressIndicator />}

      {resultado && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="text-sm font-medium text-gray-900">Documento Generado</div>
              <textarea
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 p-3 text-sm font-mono"
            rows={15}
                readOnly
            value={resultado}
              />
          <div className="flex gap-2">
              <button
              className="btn-secondary text-xs"
                onClick={() => {
                navigator.clipboard.writeText(resultado);
                alert("Documento copiado al portapapeles");
              }}
            >
              📋 Copiar
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={() => {
                const blob = new Blob([resultado], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${plantillaSeleccionada.nombre.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              ⬇️ Descargar
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

// Panel de Historial con filtros por tipo
function HistorialPanel({ items }: { items: Array<any> }) {
  const [filtro, setFiltro] = useState<"todos" | "memos" | "analisis" | "contratos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);

  // Clasificar items por tipo
  const itemsFiltrados = useMemo(() => {
    let resultado = items;
    
    // Filtrar por tipo
    if (filtro === "memos") {
      resultado = resultado.filter(item => 
        item.type === "memo" || item.tipo?.toLowerCase().includes("memo") || item.tipo?.toLowerCase().includes("dictamen")
      );
    } else if (filtro === "analisis") {
      resultado = resultado.filter(item => 
        item.type === "analysis" || item.tipo?.toLowerCase().includes("análisis") || item.tipo?.toLowerCase().includes("analisis")
      );
    } else if (filtro === "contratos") {
      resultado = resultado.filter(item => 
        item.type === "contrato" || item.tipo?.toLowerCase().includes("contrato")
      );
    }

    // Filtrar por búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      resultado = resultado.filter(item =>
        item.title?.toLowerCase().includes(termino) ||
        item.asunto?.toLowerCase().includes(termino) ||
        item.markdown?.toLowerCase().includes(termino)
      );
    }

    // Ordenar por fecha (más reciente primero)
    return resultado.sort((a, b) => {
      const fechaA = new Date(a.createdAt || 0).getTime();
      const fechaB = new Date(b.createdAt || 0).getTime();
      return fechaB - fechaA;
    });
  }, [items, filtro, busqueda]);

  const contadores = useMemo(() => ({
    todos: items.length,
    memos: items.filter(item => item.type === "memo" || item.tipo?.toLowerCase().includes("memo") || item.tipo?.toLowerCase().includes("dictamen")).length,
    analisis: items.filter(item => item.type === "analysis" || item.tipo?.toLowerCase().includes("análisis") || item.tipo?.toLowerCase().includes("analisis")).length,
    contratos: items.filter(item => item.type === "contrato" || item.tipo?.toLowerCase().includes("contrato")).length,
  }), [items]);

  const getTipoIcon = (item: any) => {
    if (item.type === "memo" || item.tipo?.toLowerCase().includes("memo")) return "📝";
    if (item.type === "analysis" || item.tipo?.toLowerCase().includes("análisis")) return "🔍";
    if (item.type === "contrato" || item.tipo?.toLowerCase().includes("contrato")) return "📄";
    return "📋";
  };

  const getTipoColor = (item: any) => {
    if (item.type === "memo" || item.tipo?.toLowerCase().includes("memo")) return "bg-purple-100 text-purple-700";
    if (item.type === "analysis" || item.tipo?.toLowerCase().includes("análisis")) return "bg-blue-100 text-blue-700";
    if (item.type === "contrato" || item.tipo?.toLowerCase().includes("contrato")) return "bg-green-100 text-green-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => setFiltro("todos")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === "todos" ? "bg-[#C026D3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            📋 Todos ({contadores.todos})
          </button>
          <button
            onClick={() => setFiltro("memos")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === "memos" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            📝 Memos / Reuniones ({contadores.memos})
          </button>
          <button
            onClick={() => setFiltro("analisis")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === "analisis" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            🔍 Documentos Analizados ({contadores.analisis})
          </button>
          <button
            onClick={() => setFiltro("contratos")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === "contratos" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            📄 Contratos Creados ({contadores.contratos})
          </button>
        </div>
        
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por título, asunto o contenido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#C026D3] focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista de items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {itemsFiltrados.length === 0 ? (
          <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">No hay documentos en esta categoría</p>
          </div>
        ) : (
          itemsFiltrados.map((item) => (
            <div
              key={item.id}
              onClick={() => setItemSeleccionado(item)}
              className={`bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-[#C026D3] hover:shadow-md transition-all ${
                itemSeleccionado?.id === item.id ? "border-[#C026D3] ring-2 ring-[#C026D3]/20" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getTipoIcon(item)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTipoColor(item)}`}>
                    {item.tipo || item.type || "Documento"}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{item.creado || new Date(item.createdAt).toLocaleDateString("es-AR")}</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-1 line-clamp-2">{item.title || item.asunto || "Sin título"}</h4>
              {item.memoData?.resumen && (
                <p className="text-sm text-gray-500 line-clamp-2">{item.memoData.resumen}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className={`px-2 py-0.5 rounded text-xs ${
                  item.estado === "Listo para revisión" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {item.estado || "Completado"}
                </span>
                {item.areaLegal && (
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                    {item.areaLegal.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de detalle */}
      {itemSeleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setItemSeleccionado(null)}>
          <div 
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{getTipoIcon(itemSeleccionado)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTipoColor(itemSeleccionado)}`}>
                    {itemSeleccionado.tipo || itemSeleccionado.type}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">{itemSeleccionado.title || itemSeleccionado.asunto}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Creado: {itemSeleccionado.creado || new Date(itemSeleccionado.createdAt).toLocaleDateString("es-AR")}
                  {itemSeleccionado.areaLegal && ` · ${itemSeleccionado.areaLegal.replace(/_/g, " ")}`}
                </p>
              </div>
              <button
                onClick={() => setItemSeleccionado(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {itemSeleccionado.memoData?.resumen && (
                <div className="mb-4 p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-purple-900 mb-1">Resumen</h4>
                  <p className="text-sm text-purple-800">{itemSeleccionado.memoData.resumen}</p>
                </div>
              )}
              {itemSeleccionado.markdown && (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg overflow-auto">
                    {itemSeleccionado.markdown}
                  </pre>
                </div>
              )}
              {itemSeleccionado.citations && itemSeleccionado.citations.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Fuentes citadas</h4>
                  <div className="space-y-2">
                    {itemSeleccionado.citations.map((cita: any, i: number) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                        <span className="font-medium">{cita.title || cita.referencia}</span>
                        {cita.url && (
                          <a href={cita.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#C026D3] hover:underline">
                            Ver fuente →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(itemSeleccionado.markdown || "");
                  alert("Contenido copiado al portapapeles");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                📋 Copiar
              </button>
              <button
                onClick={() => setItemSeleccionado(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-[#C026D3] rounded-lg hover:bg-[#A21CAF] transition-colors"
              >
                Cerrar
              </button>
            </div>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll cuando cambian los mensajes o cuando termina de cargar
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, loading]);

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
        <div ref={messagesEndRef} />
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
