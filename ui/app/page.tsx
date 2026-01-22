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

// Helper para extraer contexto relevante del chat para regenerar análisis
function extractChatContext(chatMessages: Array<{role: "user" | "assistant"; content: string}>): string {
  if (!chatMessages || chatMessages.length === 0) {
    return "";
  }
  
  // Extraer TODOS los mensajes del usuario (son instrucciones directas)
  // Y TODAS las respuestas del asistente (contienen conclusiones y análisis)
  const relevantMessages: string[] = [];
  
  for (let i = 0; i < chatMessages.length; i++) {
    const msg = chatMessages[i];
    if (msg.role === "user") {
      // TODOS los mensajes del usuario son importantes (son instrucciones directas)
      relevantMessages.push(`INSTRUCCIÓN DEL USUARIO: ${msg.content}`);
    } else if (msg.role === "assistant") {
      // Incluir TODAS las respuestas del asistente (contienen conclusiones, análisis y recomendaciones)
      // Limitar a 400 caracteres por respuesta para no exceder el límite total
      const truncated = msg.content.length > 400 ? msg.content.substring(0, 400) + "..." : msg.content;
      relevantMessages.push(`CONCLUSIÓN/ANÁLISIS DEL ASISTENTE: ${truncated}`);
    }
  }
  
  if (relevantMessages.length === 0) {
    return "";
  }
  
  // Aumentar límite a 2000 caracteres para incluir más contexto
  const context = relevantMessages.join("\n\n");
  return context.length > 2000 ? context.substring(0, 2000) + "..." : context;
}

// Helper para generar un resumen breve del chat
function generateChatSummary(chatMessages: Array<{role: "user" | "assistant"; content: string}>): string {
  if (!chatMessages || chatMessages.length === 0) {
    return "";
  }
  
  const userMessages = chatMessages.filter(m => m.role === "user").map(m => m.content);
  if (userMessages.length === 0) {
    return "";
  }
  
  // Crear un resumen de las instrucciones del usuario
  if (userMessages.length === 1) {
    return userMessages[0].substring(0, 150);
  } else {
    return `${userMessages.length} instrucciones del usuario: ${userMessages.slice(0, 2).join("; ").substring(0, 150)}...`;
  }
}

// Helper para extraer puntos clave del chat que se aplicarán al análisis
function extractKeyPointsFromChat(chatMessages: Array<{role: "user" | "assistant"; content: string}>): string[] {
  if (!chatMessages || chatMessages.length === 0) {
    return [];
  }
  
  const keyPoints: string[] = [];
  
  for (const msg of chatMessages) {
    if (msg.role === "user") {
      // Las instrucciones del usuario son puntos clave
      const content = msg.content.trim();
      if (content.length > 0) {
        // Si es muy largo, truncar
        const point = content.length > 100 ? content.substring(0, 100) + "..." : content;
        keyPoints.push(`📌 ${point}`);
      }
    } else if (msg.role === "assistant") {
      // Extraer conclusiones clave del asistente (primeras 2-3 frases)
      const sentences = msg.content.split(/[.!?]\s+/).filter(s => s.trim().length > 20);
      if (sentences.length > 0) {
        const keyConclusion = sentences.slice(0, 2).join(". ").trim();
        if (keyConclusion.length > 0 && keyConclusion.length < 150) {
          keyPoints.push(`💡 ${keyConclusion}...`);
        }
      }
    }
  }
  
  return keyPoints.slice(0, 5); // Máximo 5 puntos clave
}

// KPIs iniciales (se actualizarán con datos reales)
const initialKpis = [
  { title: "Solicitudes en Cola", value: "0", caption: "Pendientes", icon: Clock3, color: "text-amber-600" },
  { title: "Docs Generados (7d)", value: "0", caption: "Cargando...", icon: FileText, color: "text-emerald-600" },
  { title: "Exactitud de Citas", value: "N/A", caption: "últ. 100 docs", icon: CheckCircle2, color: "text-emerald-600" },
  { title: "Latencia Media", value: "N/A", caption: "p95: N/A", icon: Loader2, color: "text-slate-600" },
  { title: "Fuentes Conectadas", value: "0", caption: "Cargando...", icon: BookOpen, color: "text-slate-600" },
  { title: "Usuarios Activos", value: "1", caption: "Usuario actual", icon: Users, color: "text-slate-600" },
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
          // Verificar qué items de localStorage ya no existen en la DB (fueron borrados)
          const dbIds = new Set(dbItems.map((i: any) => i.id));
          const validLocalItems = localItems.filter((i: any) => {
            // Si el item está en la DB, mantenerlo (la versión de la DB es más actualizada)
            if (dbIds.has(i.id)) {
              return false; // No incluir, la DB tiene la versión actualizada
            }
            // Si el item no está en la DB pero es un memo local (no analysis), mantenerlo
            if (i.type === 'memo' || !i.type) {
              return true;
            }
            // Si es un análisis que no está en la DB, marcarlo como posiblemente borrado
            // pero mantenerlo en la lista con un estado especial
            return true;
          });
          
          // Combinar items locales válidos con los de la DB, evitando duplicados por ID
          const localIds = new Set(validLocalItems.map((i: any) => i.id));
          const combinedItems = [
            ...validLocalItems.map((item: any) => {
              // Si es un análisis que no está en la DB, marcarlo como posiblemente borrado
              if ((item.type === 'analysis' || item.tipo === 'ANÁLISIS') && !dbIds.has(item.id)) {
                return {
                  ...item,
                  estado: item.estado || 'Posiblemente eliminado',
                  memoData: {
                    ...item.memoData,
                    resumen: item.memoData?.resumen || '⚠️ Este análisis puede haber sido eliminado automáticamente por el sistema de limpieza.'
                  }
                };
              }
              return item;
            }),
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
    <div className="min-h-screen bg-gray-50 text-gray-800 antialiased font-display flex flex-col">
      <div className="flex flex-1 min-h-0">
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
              <div className="mt-8">
                <BandejaLocal 
                  items={items} 
                  onDelete={(id) => {
                    // Actualizar items removiendo el eliminado
                    const updated = items.filter(item => item.id !== id);
                    setItems(updated);
                    // Actualizar localStorage
                    try {
                      localStorage.setItem("legal-memos", JSON.stringify(updated.filter(item => item.type === "memo" || item.memoData)));
                    } catch (e) {
                      console.warn("No se pudo actualizar localStorage:", e);
                    }
                  }}
                  onUpdateItem={(id, updates) => {
                    // Actualizar el item con los nuevos datos
                    const updated = items.map(item => 
                      item.id === id ? { ...item, ...updates } : item
                    );
                    setItems(updated);
                    // Actualizar localStorage (guardar todos los items, no solo memos)
                    try {
                      // Guardar todos los items que están en localStorage (memos y análisis locales)
                      const allLocalItems = updated.filter(item => 
                        item.type === "memo" || 
                        item.memoData || 
                        (item.type === "analysis" && !item.fromDb) // Solo análisis que no vienen de DB
                      );
                      localStorage.setItem("legal-memos", JSON.stringify(allLocalItems));
                    } catch (e) {
                      console.warn("No se pudo actualizar localStorage:", e);
                    }
                  }}
                />
              </div>
                </>
              ) : activeView === "analizar" ? (
                <AnalizarDocumentosPanel />
              ) : activeView === "generar" ? (
                /* Vista Generar - pantalla completa mejorada */
                <div className="w-full">
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
                        tipoDocumento: out.tipoDocumento || "Transcripción de reunión",
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
          <Footer />
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

function WNSLogo() {
  const [logoExists, setLogoExists] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    // Verificar si el logo existe antes de intentar cargarlo
    const img = new Image();
    img.onload = () => setLogoExists(true);
    img.onerror = () => setLogoExists(false);
    img.src = '/wns-logo.png';
  }, []);
  
  if (logoExists === false) {
    return null; // No mostrar nada si el logo no existe
  }
  
  return (
    <div className="flex items-center">
      <img 
        src="/wns-logo.png" 
        alt="WNS & Asociados" 
        className="h-48 w-auto object-contain"
        style={{ display: logoExists === true ? 'block' : 'none' }}
      />
    </div>
  );
}

function Footer() {
  const [showIASolutionsLogo, setShowIASolutionsLogo] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    // Verificar si el logo existe antes de intentar cargarlo
    const img = new Image();
    img.onload = () => setShowIASolutionsLogo(true);
    img.onerror = () => setShowIASolutionsLogo(false);
    img.src = '/ia-solutions-logo.png';
  }, []);
  
  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-center gap-2">
      <span className="text-xs text-gray-500">Powered by</span>
      {showIASolutionsLogo === true ? (
        <img 
          src="/ia-solutions-logo.png" 
          alt="IA Solutions" 
          className="h-5 w-auto object-contain"
        />
      ) : (
        <span className="text-xs font-semibold text-gray-700">IA Solutions</span>
      )}
    </footer>
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
        {/* Logo WNS */}
        <WNSLogo />
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
  const [kpis, setKpis] = useState(initialKpis);
  const [loading, setLoading] = useState(true);
  
  const iconColors: Record<string, string> = {
    "Solicitudes en Cola": "text-orange-500",
    "Docs Generados (7d)": "text-green-500",
    "Exactitud de Citas": "text-blue-500",
    "Latencia Media": "text-red-500",
    "Fuentes Conectadas": "text-purple-500",
    "Usuarios Activos": "text-cyan-500"
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const API = getApiUrl();
        if (!API) {
          console.warn("[KPIs] API URL no configurada");
          setLoading(false);
          return;
        }

        const response = await fetch(`${API}/legal/stats`);
        if (!response.ok) {
          throw new Error(`Error ${response.status}`);
        }

        const stats = await response.json();
        
        setKpis([
          { 
            title: "Solicitudes en Cola", 
            value: String(stats.queue || 0), 
            caption: "Pendientes", 
            icon: Clock3, 
            color: "text-amber-600" 
          },
          { 
            title: "Docs Generados (7d)", 
            value: String(stats.docsGenerated7d || 0), 
            caption: stats.docsGrowth && stats.docsGrowth !== "0" 
              ? `${stats.docsGrowth > 0 ? '+' : ''}${stats.docsGrowth}% vs prev.` 
              : "Sin datos previos", 
            icon: FileText, 
            color: "text-emerald-600" 
          },
          { 
            title: "Exactitud de Citas", 
            value: stats.accuracy || "N/A", 
            caption: "últ. 100 docs", 
            icon: CheckCircle2, 
            color: "text-emerald-600" 
          },
          { 
            title: "Latencia Media", 
            value: stats.avgLatency || "N/A", 
            caption: stats.p95Latency ? `p95: ${stats.p95Latency}` : "p95: N/A", 
            icon: Loader2, 
            color: "text-slate-600" 
          },
          { 
            title: "Fuentes Conectadas", 
            value: String(stats.sourcesConnected || 0), 
            caption: stats.sourcesNames && stats.sourcesNames !== "Ninguna" 
              ? stats.sourcesNames.length > 40 
                ? stats.sourcesNames.substring(0, 40) + "..." 
                : stats.sourcesNames
              : "Ninguna", 
            icon: BookOpen, 
            color: "text-slate-600" 
          },
          { 
            title: "Usuarios Activos", 
            value: String(stats.activeUsers || 1), 
            caption: "Usuario actual", 
            icon: Users, 
            color: "text-slate-600" 
          },
        ]);
      } catch (err: any) {
        console.error("[KPIs] Error cargando estadísticas:", err);
        // Mantener valores iniciales en caso de error
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Actualizar cada 30 segundos
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
      {kpis.map((k, i) => {
        const iconColor = iconColors[k.title] || "text-gray-500";
        return (
          <div key={k.title} className="bg-white p-5 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-gray-600">{k.title}</p>
              <k.icon className={`h-5 w-5 ${iconColor} ${loading ? 'animate-pulse' : ''}`} />
            </div>
            <p className="text-4xl font-bold text-gray-900 mb-3">
              {loading && k.value === "0" ? "..." : k.value}
            </p>
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

function BandejaLocal({ items, onDelete, onUpdateItem }: { items: any[]; onDelete?: (id: string) => void; onUpdateItem?: (id: string, updates: any) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [assignModal, setAssignModal] = useState<{ id: string; title: string } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<{ abogado: string } | null>(null);
  const [showAssignedInfo, setShowAssignedInfo] = useState<{ id: string; abogado: string; title: string } | null>(null);
  const [abogados, setAbogados] = useState<Array<{id: string; nombre: string; telefono?: string; email: string}>>([]);
  const [loadingAbogados, setLoadingAbogados] = useState(false);
  
  // Mostrar tanto memos como análisis
  const memos = items.filter(item => 
    item.type === "memo" || 
    item.type === "analysis" || 
    item.memoData || 
    item.markdown // Si tiene markdown, es un documento válido
  );
  
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

  // Cargar lista de abogados desde la API
  useEffect(() => {
    const loadAbogados = async () => {
      setLoadingAbogados(true);
      try {
        const API = getApiUrl();
        if (!API) {
          console.warn("[ABOGADOS] API URL no configurada");
          // Fallback a lista hardcodeada si no hay API
          setAbogados([
            { id: "1", nombre: "Abogado 1", email: "abogado1@wns.com" },
            { id: "2", nombre: "Abogado 2", email: "abogado2@wns.com" },
            { id: "3", nombre: "Abogado 3", email: "abogado3@wns.com" },
            { id: "4", nombre: "Abogado 4", email: "abogado4@wns.com" },
            { id: "5", nombre: "Abogado 5", email: "abogado5@wns.com" },
            { id: "6", nombre: "Abogado 6", email: "abogado6@wns.com" },
          ]);
          setLoadingAbogados(false);
          return;
        }

        const response = await fetch(`${API}/legal/abogados`);
        if (!response.ok) {
          throw new Error(`Error ${response.status}`);
        }

        const data = await response.json();
        if (data.abogados && data.abogados.length > 0) {
          setAbogados(data.abogados);
        } else {
          // Fallback a lista hardcodeada si no hay abogados en DB
          setAbogados([
            { id: "1", nombre: "Abogado 1", email: "abogado1@wns.com" },
            { id: "2", nombre: "Abogado 2", email: "abogado2@wns.com" },
            { id: "3", nombre: "Abogado 3", email: "abogado3@wns.com" },
            { id: "4", nombre: "Abogado 4", email: "abogado4@wns.com" },
            { id: "5", nombre: "Abogado 5", email: "abogado5@wns.com" },
            { id: "6", nombre: "Abogado 6", email: "abogado6@wns.com" },
          ]);
        }
      } catch (err: any) {
        console.error("[ABOGADOS] Error cargando abogados:", err);
        // Fallback a lista hardcodeada en caso de error
        setAbogados([
          { id: "1", nombre: "Abogado 1", email: "abogado1@wns.com" },
          { id: "2", nombre: "Abogado 2", email: "abogado2@wns.com" },
          { id: "3", nombre: "Abogado 3", email: "abogado3@wns.com" },
          { id: "4", nombre: "Abogado 4", email: "abogado4@wns.com" },
          { id: "5", nombre: "Abogado 5", email: "abogado5@wns.com" },
          { id: "6", nombre: "Abogado 6", email: "abogado6@wns.com" },
        ]);
      } finally {
        setLoadingAbogados(false);
      }
    };

    loadAbogados();
  }, []);
  
  // Filtrar documentos
  const filteredMemos = memos.filter(memo => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      (memo.title || memo.asunto || "").toLowerCase().includes(searchLower) ||
      (memo.areaLegal || "").toLowerCase().includes(searchLower);
    
    const matchesTipo = filterTipo === "all" || 
      (filterTipo === "analisis" && (memo.type === "analysis" || memo.tipo === "ANÁLISIS")) ||
      (filterTipo === "memo" && (memo.type === "memo" || memo.memoData));
    
    const matchesArea = filterArea === "all" || memo.areaLegal === filterArea;
    
    return matchesSearch && matchesTipo && matchesArea;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      {/* Header mejorado */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-gray-200 rounded-t-xl">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-900">Bandeja de Solicitudes</h3>
            <p className="text-sm text-gray-600 mt-1">Documentos generados a sesión · {filteredMemos.length} {filteredMemos.length === 1 ? 'documento' : 'documentos'}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Buscador */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-64"
              />
            </div>
            {/* Filtros */}
            <div className="flex items-center gap-2">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              >
                <option value="all">Todos los tipos</option>
                <option value="analisis">Análisis</option>
                <option value="memo">Memos/Reuniones</option>
              </select>
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              >
                <option value="all">Todas las áreas</option>
                <option value="civil_comercial">Civil, Comercial y Societario</option>
                <option value="laboral">Laboral</option>
                <option value="corporativo">Corporativo</option>
                <option value="compliance">Compliance</option>
                <option value="marcas">Marcas y Propiedad Intelectual</option>
                <option value="consumidor">Consumidor</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabla de solicitudes mejorada */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Documento</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Tipo</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Área</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Estado</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Fecha</th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-700 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
        {filteredMemos.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-sm text-gray-500 py-12 text-center">
                  {memos.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-12 w-12 text-gray-300" />
                      <p className="text-gray-600">Aún no hay documentos generados.</p>
                      <p className="text-sm text-gray-500">Ve a "Generar" para crear tu primer documento.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Search className="h-12 w-12 text-gray-300" />
                      <p className="text-gray-600">No se encontraron documentos con los filtros seleccionados.</p>
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setFilterTipo("all");
                          setFilterArea("all");
                        }}
                        className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </td>
              </tr>
        ) : (
          filteredMemos.map((row) => (
                <tr key={row.id} className="hover:bg-purple-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        row.type === "analysis" ? "bg-blue-100" : "bg-purple-100"
                      }`}>
                        {row.type === "analysis" ? (
                          <FileText className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Gavel className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {row.title || row.asunto}
                        </div>
                        {row.memoData?.resumen && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                            {row.memoData.resumen.substring(0, 100)}...
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      row.type === "analysis" 
                        ? "bg-blue-100 text-blue-800" 
                        : "bg-purple-100 text-purple-800"
                    }`}>
                      {row.type === "analysis" ? "Análisis" : (row.tipoDocumento || row.tipo || "Reunión")}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600">{getAreaLegalLabel(row.areaLegal || "civil_comercial")}</td>
                  <td className="py-4 px-6">
                    {row.estado === "Asignado" ? (
                      <button
                        onClick={() => setShowAssignedInfo({ 
                          id: row.id, 
                          abogado: row.abogadoAsignado || "Abogado no especificado",
                          title: row.title || row.asunto || "documento"
                        })}
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer transition-colors"
                      >
                        <span className="w-2 h-2 mr-2 rounded-full bg-blue-500"></span>
                        Asignado
                      </button>
                    ) : (row.estado === "Listo para revisión" || row.status === "completed") ? (
                      <button
                        onClick={() => setAssignModal({ id: row.id, title: row.title || row.asunto || "documento" })}
                        className="inline-flex items-center text-sm font-medium text-green-600 hover:text-green-800 cursor-pointer transition-colors"
                      >
                        <span className="w-2 h-2 mr-2 rounded-full bg-green-500"></span>
                        Listo para revisión
                      </button>
                    ) : (
                      <span className="inline-flex items-center text-sm font-medium text-gray-600">
                        <span className="w-2 h-2 mr-2 rounded-full bg-amber-500"></span>
                        {row.estado || row.status || "Pendiente"}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-600">
                      {formatFecha(row.createdAt || row.creado || new Date().toISOString())}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-2 rounded-lg hover:bg-purple-100 text-gray-600 hover:text-purple-600 transition-colors"
                        onClick={() => window.location.href = `/memos/${row.id}`}
                        title="Ver documento"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button 
                        className="p-2 rounded-lg hover:bg-purple-100 text-gray-600 hover:text-purple-600 transition-colors"
                        onClick={async () => {
                          const API = getApiUrl();
                          let content = row.markdown || row.memoData?.texto_formateado || "";
                          let filename = row.asunto || row.title || "documento";
                          
                          // Si no hay contenido y es un análisis, intentar cargarlo desde la API
                          if (!content && row.type === "analysis" && row.id && API) {
                            try {
                              const response = await fetch(`${API}/legal/result/${row.id}`);
                              if (response.ok) {
                                const data = await response.json();
                                if (data.analysis?.report) {
                                  let report = data.analysis.report;
                                  if (typeof report === 'string') {
                                    try {
                                      report = JSON.parse(report);
                                    } catch {
                                      // Si no es JSON, usar directamente
                                    }
                                  }
                                  content = report?.texto_formateado || report?.resumen_ejecutivo || JSON.stringify(report, null, 2);
                                  filename = report?.titulo || data.filename || filename;
                                }
                              }
                            } catch (err) {
                              console.error("Error al cargar contenido para descarga:", err);
                            }
                          }
                          
                          if (content) {
                            await downloadMD(filename, content);
                          } else {
                            alert("No hay contenido disponible para descargar.");
                          }
                        }}
                        title="Descargar Word (.docx)"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button 
                        className="p-1.5 rounded-md hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ id: row.id, title: row.title || row.asunto || "documento" });
                        }}
                        title="Eliminar documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal de asignación de abogado */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900">Asignar a Abogado</h3>
            <p className="text-sm text-gray-700">
              Seleccioná un abogado para asignar el documento <span className="font-semibold">"{assignModal.title}"</span>
            </p>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {loadingAbogados ? (
                <div className="text-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-[#C026D3] mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Cargando abogados...</p>
                </div>
              ) : abogados.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No hay abogados disponibles</p>
              ) : (
                abogados.map((abogado) => (
                  <button
                    key={abogado.id}
                    onClick={async () => {
                      setAssigning(true);
                      try {
                        // Simular envío por correo (por ahora solo cambio de estado)
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Actualizar el estado usando el callback PRIMERO para actualizar la UI inmediatamente
                        if (onUpdateItem) {
                          onUpdateItem(assignModal.id, { 
                            estado: "Asignado", 
                            abogadoAsignado: abogado.nombre,
                            abogadoId: abogado.id,
                            abogadoEmail: abogado.email,
                            abogadoTelefono: abogado.telefono
                          });
                        }
                        
                        // Luego actualizar localStorage para persistir
                        const saved = localStorage.getItem("legal-memos");
                        if (saved) {
                          try {
                            const memos = JSON.parse(saved);
                            const updated = memos.map((m: any) => 
                              m.id === assignModal.id 
                                ? { 
                                    ...m, 
                                    estado: "Asignado", 
                                    abogadoAsignado: abogado.nombre,
                                    abogadoId: abogado.id,
                                    abogadoEmail: abogado.email,
                                    abogadoTelefono: abogado.telefono
                                  }
                                : m
                            );
                            localStorage.setItem("legal-memos", JSON.stringify(updated));
                          } catch (err) {
                            console.error("Error al actualizar estado:", err);
                          }
                        }
                        
                        // Si no hay callback, recargar la página como fallback
                        if (!onUpdateItem) {
                          window.location.reload();
                          return;
                        }
                        
                        // Mostrar modal de confirmación personalizado
                        setAssignModal(null);
                        setAssignSuccess({ abogado: abogado.nombre });
                      } catch (err: any) {
                        console.error("Error al asignar:", err);
                        setAssignModal(null);
                        alert(`Error al asignar: ${err.message || "Intenta de nuevo"}`);
                      } finally {
                        setAssigning(false);
                      }
                    }}
                    disabled={assigning}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-[#C026D3] hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{abogado.nombre}</span>
                        {abogado.telefono && (
                          <span className="text-xs text-gray-500">{abogado.telefono}</span>
                        )}
                        <span className="text-xs text-gray-400">{abogado.email}</span>
                      </div>
                      {assigning && <Loader2 className="h-4 w-4 animate-spin text-[#C026D3]" />}
                    </div>
                  </button>
                ))
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setAssignModal(null)}
                disabled={assigning}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de confirmación de asignación */}
      {assignSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900">✅ Asignación exitosa</h3>
            <p className="text-sm text-gray-700">
              Documento asignado a <span className="font-semibold">{assignSuccess.abogado}</span>. Se envió una notificación por correo.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setAssignSuccess(null)}
                className="px-4 py-2 bg-[#C026D3] text-white text-sm font-medium rounded-lg hover:bg-[#A01FB8] transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de información de asignación */}
      {showAssignedInfo && (() => {
        const item = items.find(i => i.id === showAssignedInfo.id);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-xl font-bold text-gray-900">Información de Asignación</h3>
              <p className="text-sm text-gray-700">
                El documento <span className="font-semibold">"{showAssignedInfo.title}"</span> está asignado a:
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-lg font-semibold text-blue-900">{showAssignedInfo.abogado}</p>
                {item?.abogadoEmail && (
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Email:</span> {item.abogadoEmail}
                  </p>
                )}
                {item?.abogadoTelefono && (
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Teléfono:</span> {item.abogadoTelefono}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAssignedInfo(null)}
                  className="px-4 py-2 bg-[#C026D3] text-white text-sm font-medium rounded-lg hover:bg-[#A01FB8] transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Modal de confirmación de eliminación */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900">Confirmar eliminación</h3>
            <p className="text-sm text-gray-700">
              ¿Estás seguro de que querés eliminar <span className="font-semibold">"{deleteConfirm.title}"</span>?
            </p>
            <p className="text-xs text-red-600 font-medium">
              ⚠️ Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const idToDelete = deleteConfirm.id;
                  const itemToDelete = memos.find(m => m.id === idToDelete);
                  const isAnalysis = itemToDelete?.type === "analysis";
                  setDeleteConfirm(null);
                  
                  try {
                    // Si es un análisis, eliminar de la base de datos
                    if (isAnalysis) {
                      const API = getApiUrl();
                      if (API) {
                        const response = await fetch(`${API}/legal/document/${idToDelete}`, {
                          method: "DELETE"
                        });
                        
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({ message: "Error desconocido" }));
                          throw new Error(errorData.message || `Error ${response.status}`);
                        }
                        console.log(`[DELETE] ✅ Análisis ${idToDelete} eliminado de la DB`);
                      }
                    }
                    
                    // Eliminar del localStorage (si existe)
                    const saved = localStorage.getItem("legal-memos");
                    if (saved) {
                      try {
                        const memos = JSON.parse(saved);
                        const filtered = memos.filter((m: any) => m.id !== idToDelete);
                        localStorage.setItem("legal-memos", JSON.stringify(filtered));
                      } catch (err) {
                        console.warn("Error al eliminar del localStorage:", err);
                      }
                    }
                    
                    // Llamar al callback si existe para actualizar el estado sin recargar
                    if (onDelete) {
                      onDelete(idToDelete);
                    } else {
                      // Fallback: recargar la página
                      window.location.reload();
                    }
                  } catch (err: any) {
                    console.error("Error al eliminar:", err);
                    alert(`Error al eliminar el documento: ${err.message || "Intenta de nuevo"}`);
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
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
            {memo.tipoDocumento || "REUNIÓN"} · Listo para revisión · {formatFecha(memo.createdAt || memo.creado || new Date().toISOString())}
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
          <button 
            className="p-1.5 rounded-md hover:bg-gray-100 hover:text-[#C026D3]"
            onClick={async (e) => {
              e.stopPropagation();
              const API = getApiUrl();
              let content = memo.markdown || memo.memoData?.texto_formateado || "";
              let filename = memo.asunto || memo.title || "documento";
              
              // Si no hay contenido y es un análisis, intentar cargarlo desde la API
              if (!content && memo.type === "analysis" && memo.id && API) {
                try {
                  const response = await fetch(`${API}/legal/result/${memo.id}`);
                  if (response.ok) {
                    const data = await response.json();
                    if (data.analysis?.report) {
                      let report = data.analysis.report;
                      if (typeof report === 'string') {
                        try {
                          report = JSON.parse(report);
                        } catch {
                          // Si no es JSON, usar directamente
                        }
                      }
                      content = report?.texto_formateado || report?.resumen_ejecutivo || JSON.stringify(report, null, 2);
                      filename = report?.titulo || data.filename || filename;
                    }
                  }
                } catch (err) {
                  console.error("Error al cargar contenido para descarga:", err);
                }
              }
              
              if (content) {
                await downloadMD(filename, content);
              } else {
                alert("No hay contenido disponible para descargar.");
              }
            }}
            title="Descargar en Word (.docx)"
          >
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
          <button 
            className="icon-btn" 
            title="Descargar en Word (.docx)" 
            onClick={async () => {
              const API = getApiUrl();
              let content = row.markdown || row.memoData?.texto_formateado || "";
              let filename = row.asunto || row.title || "documento";
              
              // Si no hay contenido y es un análisis, intentar cargarlo desde la API
              if (!content && row.type === "analysis" && row.id && API) {
                try {
                  const response = await fetch(`${API}/legal/result/${row.id}`);
                  if (response.ok) {
                    const data = await response.json();
                    if (data.analysis?.report) {
                      let report = data.analysis.report;
                      if (typeof report === 'string') {
                        try {
                          report = JSON.parse(report);
                        } catch {
                          // Si no es JSON, usar directamente
                        }
                      }
                      content = report?.texto_formateado || report?.resumen_ejecutivo || JSON.stringify(report, null, 2);
                      filename = report?.titulo || data.filename || filename;
                    }
                  }
                } catch (err) {
                  console.error("Error al cargar contenido para descarga:", err);
                }
              }
              
              if (content) {
                await downloadMD(filename, content);
              } else {
                alert("No hay contenido disponible para descargar.");
              }
            }}
          >
            <Download className="h-4 w-4" />
          </button>
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
        <div className="text-sm font-medium text-slate-900 mb-1">💬 Chat sobre la Reunión</div>
        <div className="text-xs text-slate-500">Hacé preguntas o pedí modificaciones sobre la transcripción generada</div>
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

async function downloadMD(filename: string, md: string) {
  const API = getApiUrl();
  
  if (!API) {
    // Fallback: descargar como markdown si no hay API
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${sanitize(filename)}.md`; a.click();
  URL.revokeObjectURL(url);
    return;
  }

  try {
    // Llamar al endpoint para convertir a Word
    const response = await fetch(`${API}/api/convert-to-word`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: md,
        title: filename
      })
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${await response.text()}`);
    }

    // Descargar el archivo Word
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitize(filename)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error al convertir a Word:", error);
    // Fallback: descargar como markdown si falla la conversión
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${sanitize(filename)}.md`; a.click();
    URL.revokeObjectURL(url);
    alert("Error al generar Word. Se descargó como Markdown.");
  }
}
function sanitize(s: string) { return s.replace(/[^a-z0-9\-\_\ ]/gi, "_"); }

// Componente para analizar documentos legales
function AnalizarDocumentosPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusLabel, setStatusLabel] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const instructionsLimit = 500;
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
    if (files.length === 0) {
      setError("Por favor selecciona al menos un archivo (PDF, Word, TXT, JPG, PNG)");
      return;
    }

    if (files.length > 5) {
      setError(`Máximo 5 archivos permitidos. Has seleccionado ${files.length} archivos. Por favor, selecciona máximo 5 archivos.`);
      return;
    }

    // Validar tamaño total de archivos (máximo 200MB total para 4-5 archivos)
    const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);
      setError(`El tamaño total de los archivos es demasiado grande (${totalSizeMB}MB). El máximo permitido es 200MB. Por favor, reduce el tamaño de los archivos o sube menos archivos.`);
      return;
    }

    // Validar tamaño individual (máximo 50MB por archivo)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB por archivo
    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(", ");
      const fileSizes = oversizedFiles.map(f => (f.size / 1024 / 1024).toFixed(1) + "MB").join(", ");
      setError(`Los siguientes archivos son demasiado grandes (máximo 50MB por archivo): ${fileNames} (${fileSizes}). Por favor, reduce el tamaño de estos archivos.`);
      return;
    }

    setError(null);
    setAnalyzing(true);
    setProgress(0);
    setStatusLabel(`Subiendo ${files.length} archivo${files.length > 1 ? 's' : ''}…`);
    const trimmedInstructions = instructions.trim().slice(0, instructionsLimit);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      // ✅ UPLOAD DIRECTO a legal-docs (sin proxy) para evitar ERR_STREAM_PREMATURE_CLOSE
      // Si NEXT_PUBLIC_LEGAL_DOCS_URL está configurada, usa esa (directo)
      // Si no, usa API gateway (fallback)
      const uploadUrl = LEGAL_DOCS_URL !== API 
        ? `${LEGAL_DOCS_URL}/upload-many`  // Directo a legal-docs
        : `${API}/legal/upload-many`;       // Vía gateway (fallback)
      
      console.log(`[UPLOAD] Subiendo ${files.length} archivo(s) a: ${uploadUrl}`);
      
      const response = await fetchWithTimeout(uploadUrl, {
        method: "POST",
        body: formData,
      }, 180000); // 3 minutos para upload directo (sin proxy)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Error al subir archivos (${response.status}): ${errorText || response.statusText || "Sin detalles"}`);
      }

      const data = await response.json();
      const uploadedDocumentIds = data.documents.map((doc: any) => doc.documentId);
      setDocumentIds(uploadedDocumentIds);

      // Iniciar análisis CONJUNTO de todos los documentos
      setStatusLabel(`Iniciando análisis conjunto de ${uploadedDocumentIds.length} documento(s)…`);
      
      // Si hay múltiples documentos, hacer análisis conjunto
      if (uploadedDocumentIds.length > 1) {
        const analyzeResponse = await fetchWithTimeout(`${API}/legal/analyze-many`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentIds: uploadedDocumentIds,
            instructions: trimmedInstructions || undefined,
          }),
        }, 30000);

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text().catch(() => "");
          throw new Error(`Error al iniciar análisis conjunto (${analyzeResponse.status}): ${errorText || "Sin detalles"}`);
        }

        const analyzeData = await analyzeResponse.json();
        console.log(`[UPLOAD] Análisis conjunto iniciado:`, analyzeData);
        
        // El análisis conjunto se guarda en el primer documento
        setStatusLabel(`Analizando ${uploadedDocumentIds.length} documentos como conjunto...`);
        setPolling(true);
        pollForResults(uploadedDocumentIds[0], true); // Polling del documento principal donde está el análisis conjunto (true = es conjunto)
      } else {
        // Un solo documento: análisis normal
        const analyzeResponse = await fetchWithTimeout(`${API}/legal/analyze/${uploadedDocumentIds[0]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            trimmedInstructions
              ? { instructions: trimmedInstructions }
              : {}
          ),
        }, 30000);

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text().catch(() => "");
          throw new Error(`Error al iniciar análisis (${analyzeResponse.status}): ${errorText || "Sin detalles"}`);
        }

        setStatusLabel("Analizando documento...");
        setPolling(true);
        pollForResults(uploadedDocumentIds[0], false); // false = análisis individual
      }
    } catch (err: any) {
      setError(toUserFriendlyError(err, "Error al procesar documentos"));
      setAnalyzing(false);
    }
  };

  const pollForResults = async (docId: string, isConjointAnalysis: boolean = false) => {
    // Aumentar tiempo de espera para análisis ultra profundo (puede tardar hasta 15 minutos)
    // Análisis ultra profundo requiere más tiempo: 15 min para conjunto, 5 min para individual
    const maxAttempts = isConjointAnalysis ? 300 : 100; // ~15 min para conjunto (ultra profundo), ~5 min para individual (ultra profundo)
    let attempts = 0;
    let consecutive502s = 0;
    const maxConsecutive502s = 10; // Aumentar a 10 para análisis conjunto (más tolerante)
    let lastSuccessfulStatus = Date.now();

    const poll = async () => {
      try {
        // 1) Obtener status/progreso primero (si existe)
        try {
          const statusRes = await fetchWithTimeout(`${API}/legal/status/${docId}`, {}, 20000);
          if (statusRes.ok) {
            const s = await statusRes.json();
            if (typeof s.progress === "number") setProgress(s.progress);
            if (s.status) {
              const statusMessages: Record<string, string> = {
                'ocr': 'Extrayendo texto de documentos...',
                'translating': 'Traduciendo cláusulas...',
                'classifying': 'Clasificando documento...',
                'analyzing': 'Analizando contenido...',
                'generating_report': 'Generando reporte con IA...',
                'saving': 'Guardando análisis...',
                'completed': 'Completado',
                'error': 'Error',
                'processing': 'Procesando...'
              };
              const statusMsg = statusMessages[s.status] || s.status;
              setStatusLabel(`${statusMsg}${isConjointAnalysis ? ` (análisis conjunto)` : ''} - Intento ${attempts + 1}/${maxAttempts}`);
            }
            if (s.status === "error") {
              setError(s.error || "Error durante el análisis");
              setAnalyzing(false);
              setPolling(false);
              return;
            }
            if (s.status === "completed") {
              lastSuccessfulStatus = Date.now();
            }
          }
        } catch (statusErr) {
          // Si falla el status, continuar con /result
          console.warn(`[POLL] Error obteniendo status:`, statusErr);
        }

        // 2) Intentar obtener resultado
        const response = await fetchWithTimeout(`${API}/legal/result/${docId}`, {}, 20000);
        if (!response.ok) {
          // Si es 502, puede ser cold start o servicio sobrecargado - continuar intentando
          if (response.status === 502) {
            consecutive502s++;
            console.warn(`[POLL] Error 502 (intento ${consecutive502s}/${maxConsecutive502s})`);
            
            if (consecutive502s >= maxConsecutive502s) {
              setError("El servicio de análisis no está disponible después de múltiples intentos. Esto puede deberse a que el servicio está sobrecargado o iniciando. Por favor, intenta más tarde.");
              setAnalyzing(false);
              setPolling(false);
              return;
            }
            
            // Continuar polling - puede ser un cold start temporal o servicio sobrecargado
            if (attempts < maxAttempts) {
              attempts++;
              const waitTime = isConjointAnalysis ? 10000 : 5000; // Esperar más para análisis conjunto
              setStatusLabel(`Servicio no disponible temporalmente... (intento ${attempts}/${maxAttempts}, esperando ${waitTime/1000}s)`);
              setTimeout(poll, waitTime);
              return;
            }
          }
          
          // Para otros errores HTTP, verificar si es temporal
          if (response.status >= 500 && response.status < 600) {
            // Errores del servidor - pueden ser temporales
            if (attempts < maxAttempts) {
              attempts++;
              console.warn(`[POLL] Error ${response.status}, reintentando...`);
              setStatusLabel(`Error temporal del servidor (${response.status}), reintentando... (${attempts}/${maxAttempts})`);
              setTimeout(poll, 5000);
              return;
            }
          }
          
          // Para otros errores, lanzar excepción
          throw new Error(`Error al obtener resultados (${response.status})`);
        }
        
        // Si llegamos aquí, la respuesta fue exitosa - resetear contador de 502s
        consecutive502s = 0;
        lastSuccessfulStatus = Date.now();
        const result = await response.json();

        if (result.analysis && result.analysis.report) {
          setAnalysisResult(result);
          setAnalyzing(false);
          setPolling(false);
          setProgress(100);
          setStatusLabel("Completado");
        } else if (attempts < maxAttempts) {
          attempts++;
          const pollInterval = isConjointAnalysis ? 5000 : 3000; // Poll cada 5s para conjunto, 3s para individual
          setTimeout(poll, pollInterval);
        } else {
          // Verificar si hubo algún progreso reciente
          const timeSinceLastSuccess = Date.now() - lastSuccessfulStatus;
          if (timeSinceLastSuccess > 300000) { // 5 minutos sin progreso
            setError("El análisis está tomando más tiempo del esperado y no hay progreso reciente. El servicio puede estar sobrecargado. Por favor, intenta más tarde o con menos documentos.");
          } else {
            setError("El análisis está tomando más tiempo del esperado. Intenta más tarde.");
          }
          setAnalyzing(false);
          setPolling(false);
        }
      } catch (err: any) {
        // Manejar errores de red/timeout
        const isNetworkError = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('fetch');
        
        if (isNetworkError && attempts < maxAttempts) {
          attempts++;
          console.warn(`[POLL] Error de red/timeout, reintentando... (${attempts}/${maxAttempts})`);
          setStatusLabel(`Error de conexión, reintentando... (${attempts}/${maxAttempts})`);
          setTimeout(poll, 5000);
          return;
        }
        
        // Solo detener si no es un error temporal
        if (!err.message?.includes("502") && !isNetworkError) {
          setError(err.message || "Error al obtener resultados");
          setAnalyzing(false);
          setPolling(false);
        } else if (attempts < maxAttempts) {
          // Si es un error temporal y aún tenemos intentos, continuar
          attempts++;
          setTimeout(poll, 5000);
        } else {
          setError("El servicio de análisis no está disponible después de múltiples intentos. Por favor, intenta más tarde.");
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
              const droppedFiles = Array.from(e.dataTransfer.files).filter(
                (f) => {
                  const type = f.type.toLowerCase();
                  const name = f.name.toLowerCase();
                  return (
                    type === "application/pdf" ||
                    name.endsWith(".pdf") ||
                    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    name.endsWith(".docx") ||
                    type === "application/msword" ||
                    name.endsWith(".doc") ||
                    type === "text/plain" ||
                    name.endsWith(".txt") ||
                    type === "image/jpeg" ||
                    type === "image/jpg" ||
                    name.endsWith(".jpg") ||
                    name.endsWith(".jpeg") ||
                    type === "image/png" ||
                    name.endsWith(".png")
                  );
                }
              );
              if (droppedFiles.length > 0) {
                const newFiles = [...files, ...droppedFiles].slice(0, 5);
                setFiles(newFiles);
                setError(null);
                if (droppedFiles.length < e.dataTransfer.files.length) {
                  setError("Algunos archivos no son compatibles y fueron ignorados");
                }
              } else {
                setError("Solo se aceptan: PDF, Word (.docx, .doc), TXT, JPG, PNG");
              }
            }}
            onClick={() => document.getElementById("legal-doc-upload")?.click()}
          >
            <div className="space-y-2 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400" />
              {files.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900">
                    {files.length} archivo{files.length > 1 ? 's' : ''} seleccionado{files.length > 1 ? 's' : ''}
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-xs text-gray-700 bg-white px-2 py-1 rounded border">
                        <span className="truncate flex-1">{file.name}</span>
                        <button
                          className="ml-2 text-rose-600 hover:text-rose-700 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFiles(files.filter((_, i) => i !== index));
                            setError(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {files.length < 5 && (
                    <p className="text-xs text-gray-500">Podés agregar hasta {5 - files.length} archivo{5 - files.length > 1 ? 's' : ''} más</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Arrastrá archivos (PDF, Word, TXT, JPG, PNG) o hacé click para subir (máx. 5)</p>
              )}
            </div>
          </div>
          <input
            id="legal-doc-upload"
            type="file"
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/jpeg,image/jpg,image/png"
            multiple
            className="hidden"
            onChange={(e) => {
              const selectedFiles = Array.from(e.target.files || []).filter(
                (f) => {
                  const type = f.type.toLowerCase();
                  const name = f.name.toLowerCase();
                  return (
                    type === "application/pdf" ||
                    name.endsWith(".pdf") ||
                    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    name.endsWith(".docx") ||
                    type === "application/msword" ||
                    name.endsWith(".doc") ||
                    type === "text/plain" ||
                    name.endsWith(".txt") ||
                    type === "image/jpeg" ||
                    type === "image/jpg" ||
                    name.endsWith(".jpg") ||
                    name.endsWith(".jpeg") ||
                    type === "image/png" ||
                    name.endsWith(".png")
                  );
                }
              );
              if (selectedFiles.length > 0) {
                const newFiles = [...files, ...selectedFiles].slice(0, 5);
                setFiles(newFiles);
                setError(null);
                if (selectedFiles.length < (e.target.files?.length || 0)) {
                  setError("Algunos archivos no son compatibles y fueron ignorados");
                }
                if (newFiles.length >= 5) {
                  setError("Máximo 5 archivos permitidos");
                }
              } else if (e.target.files && e.target.files.length > 0) {
                setError("Solo se aceptan: PDF, Word (.docx, .doc), TXT, JPG, PNG");
              }
            }}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Indicaciones adicionales (opcional)
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#C026D3] focus:ring-2 focus:ring-[#C026D3]/30"
              rows={3}
              maxLength={instructionsLimit}
              placeholder="Ej.: Enfocar en la posición del proveedor / revisar cláusulas de terminación / resaltar obligaciones de la parte A."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Se usa para guiar el análisis. Máx. {instructionsLimit} caracteres.</span>
              <span>
                {instructions.length}/{instructionsLimit}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 bg-gradient-to-r from-[#C026D3] to-[#A21CAF] text-white py-3 px-6 rounded-lg font-medium hover:from-[#A21CAF] hover:to-[#7E1A8A] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={handleUpload}
              disabled={files.length === 0 || analyzing}
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {polling ? `Analizando ${files.length} documento(s)...` : `Subiendo ${files.length} archivo(s)...`}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Analizar {files.length > 0 ? `${files.length} ` : ''}Documento{files.length > 1 ? 's' : ''}
                </>
              )}
            </button>
            {files.length > 0 && !analyzing && (
              <button
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all flex items-center justify-center"
                onClick={() => {
                  setFiles([]);
                  setDocumentIds([]);
                  setAnalysisResult(null);
                  setError(null);
                }}
                title="Limpiar archivos"
              >
                Limpiar
              </button>
            )}
          </div>

          {documentIds.length > 0 && (
            <div className="text-xs text-gray-500 text-center space-y-1">
              <p>ID{documentIds.length > 1 ? 's' : ''} de documento{documentIds.length > 1 ? 's' : ''}:</p>
              {documentIds.map((id, idx) => (
                <p key={idx} className="font-mono">{id}</p>
              ))}
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
        <div className="bg-white p-6 rounded-xl border border-gray-200 animate-in fade-in duration-300">
          <h3 className="font-bold text-lg text-gray-900 mb-4">
            {statusLabel?.includes("Regenerando") ? "🔄 Regenerando análisis..." : `Analizando ${files.length} documento${files.length > 1 ? 's' : ''}...`}
          </h3>
          
          {/* Lista de documentos siendo analizados */}
          {files.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900 mb-2">
                {files.length > 1 ? "📄 Documentos incluidos en el análisis:" : "📄 Documento siendo analizado:"}
              </p>
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-blue-800">
                    <span className="text-blue-600">•</span>
                    <span className="truncate">{file.name}</span>
                    {file.size && (
                      <span className="text-xs text-blue-600 ml-auto">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {files.length > 1 && (
                <p className="text-xs text-blue-700 mt-2 italic">
                  Estos documentos se analizarán como un conjunto relacionado
                </p>
              )}
            </div>
          )}
          
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
        documentId={documentIds[0] || null}
        originalInstructions={instructions}
        onRegenerate={(docId) => {
          // Activar el estado de análisis y comenzar polling
          if (docId) {
            if (!documentIds.includes(docId)) {
              setDocumentIds([...documentIds, docId]);
            }
            setAnalyzing(true);
            setPolling(true);
            setProgress(0);
            setStatusLabel("Regenerando análisis...");
            setAnalysisResult(null);
            // Iniciar polling del nuevo análisis
            pollForResults(docId);
          }
        }}
        setAnalyzing={setAnalyzing}
        setProgress={setProgress}
        setStatusLabel={setStatusLabel}
        pollForResults={pollForResults}
      />
    </div>
  );
}

// Componente para mostrar y generar documentos sugeridos
function DocumentosSugeridosPanel({ analysisResult }: { analysisResult: any }) {
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<{ 
    tipo: string; 
    contenido: string;
    datosExtraidos?: any;
    placeholdersCount?: number;
    tienePlaceholders?: boolean;
  } | null>(null);
  const [editingPlaceholder, setEditingPlaceholder] = useState<{ index: number; value: string } | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [saved, setSaved] = useState(false);
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
    setEditingPlaceholder(null);
    setEditedContent("");

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
          citas: report?.citas || [],
          reportData: report
        })
      });

      if (!response.ok) {
        throw new Error("Error al generar documento");
      }

      const data = await response.json();
      setGeneratedDoc({ 
        tipo: doc.tipo, 
        contenido: data.documento || data.contenido || "Sin contenido",
        datosExtraidos: data.datosExtraidos,
        placeholdersCount: data.placeholdersCount || 0,
        tienePlaceholders: data.tienePlaceholders || false
      });
      setEditedContent(data.documento || data.contenido || "");
    } catch (err) {
      console.error("Error generando documento:", err);
      setGeneratedDoc({ 
        tipo: doc.tipo, 
        contenido: "Error al generar el documento. Intenta de nuevo." 
      });
      setEditedContent("");
    } finally {
      setGeneratingDoc(null);
    }
  };

  // Función para generar y descargar directamente en Word
  const handleGenerateAndDownload = async (doc: { tipo: string; descripcion: string }) => {
    setGeneratingDoc(doc.tipo);
    
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
          citas: report?.citas || [],
          reportData: report
        })
      });

      if (!response.ok) {
        throw new Error("Error al generar documento");
      }

      const data = await response.json();
      const content = data.documento || data.contenido || "";
      
      if (content) {
        // Descargar directamente en Word
        const filename = `${doc.tipo}_${new Date().toISOString().split('T')[0]}`;
        await downloadMD(filename, content);
      } else {
        alert("No se pudo generar el contenido del documento");
      }
    } catch (err) {
      console.error("Error generando y descargando documento:", err);
      alert("Error al generar el documento. Intenta de nuevo.");
    } finally {
      setGeneratingDoc(null);
    }
  };

  // Función para reemplazar un placeholder específico
  const handleReplacePlaceholder = (index: number, newValue: string) => {
    if (!editedContent) return;
    
    // Encontrar todas las ocurrencias de XXXXXX
    const parts = editedContent.split('XXXXXX');
    if (index < parts.length - 1) {
      // Reemplazar el placeholder en la posición index
      const newParts = [...parts];
      newParts[index] = newParts[index] + newValue;
      newParts[index + 1] = newParts[index + 1];
      
      // Reconstruir el contenido
      let newContent = newParts[0];
      for (let i = 1; i < newParts.length; i++) {
        if (i === index + 1) {
          newContent += newParts[i];
        } else {
          newContent += 'XXXXXX' + newParts[i];
        }
      }
      
      setEditedContent(newContent);
      setEditingPlaceholder(null);
      
      // Actualizar el documento generado
      if (generatedDoc) {
        setGeneratedDoc({ ...generatedDoc, contenido: newContent });
      }
    }
  };

  // Función para reemplazar todos los placeholders de una vez
  const handleReplaceAllPlaceholders = (newValue: string) => {
    if (!editedContent) return;
    const newContent = editedContent.replace(/XXXXXX/g, newValue);
    setEditedContent(newContent);
    if (generatedDoc) {
      setGeneratedDoc({ ...generatedDoc, contenido: newContent });
    }
  };

  // Función para guardar el documento generado
  const handleSaveDocument = () => {
    if (!generatedDoc || !editedContent) return;

    try {
      // Cargar documentos guardados existentes
      const saved = localStorage.getItem("legal-memos");
      const existingDocs = saved ? JSON.parse(saved) : [];

      // Crear el documento a guardar
      const docToSave = {
        id: `doc-${Date.now()}`,
        type: "documento_sugerido",
        title: generatedDoc.tipo,
        asunto: generatedDoc.tipo,
        tipo: "DOCUMENTO SUGERIDO",
        tipoDocumento: generatedDoc.tipo,
        areaLegal: report?.area_legal || "civil_comercial",
        createdAt: new Date().toISOString(),
        creado: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        estado: generatedDoc.tienePlaceholders ? "Pendiente de completar" : "Listo para revisión",
        markdown: editedContent,
        memoData: {
          resumen: `Documento sugerido generado a partir del análisis: ${report?.titulo || "Sin título"}`,
          texto_formateado: editedContent,
          datosExtraidos: generatedDoc.datosExtraidos || {},
          tienePlaceholders: generatedDoc.tienePlaceholders || false,
          placeholdersCount: generatedDoc.placeholdersCount || 0
        },
        citations: report?.citas || [],
        relacionadoConAnalisis: analysisResult?.documentId || null
      };

      // Agregar al inicio de la lista
      const newDocs = [docToSave, ...existingDocs];
      localStorage.setItem("legal-memos", JSON.stringify(newDocs));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      // Opcional: mostrar notificación o redirigir
      console.log("Documento guardado:", docToSave);
    } catch (error) {
      console.error("Error al guardar documento:", error);
      alert("Error al guardar el documento. Intenta de nuevo.");
    }
  };

  // Renderizar el contenido con placeholders resaltados y editables
  const renderContentWithPlaceholders = (content: string) => {
    if (!content) return null;
    
    const parts = content.split('XXXXXX');
    return (
      <div className="space-y-1">
        {parts.map((part, index) => (
          <span key={index}>
            <span className="whitespace-pre-wrap">{part}</span>
            {index < parts.length - 1 && (
              <span className="relative inline-block">
                {editingPlaceholder?.index === index ? (
                  <div className="inline-flex items-center gap-1 bg-yellow-100 border-2 border-yellow-400 rounded px-2 py-1">
                    <input
                      type="text"
                      value={editingPlaceholder.value}
                      onChange={(e) => setEditingPlaceholder({ index, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleReplacePlaceholder(index, editingPlaceholder.value);
                        } else if (e.key === 'Escape') {
                          setEditingPlaceholder(null);
                        }
                      }}
                      className="bg-white border border-yellow-500 rounded px-2 py-1 text-sm min-w-[100px]"
                      autoFocus
                    />
                    <button
                      onClick={() => handleReplacePlaceholder(index, editingPlaceholder.value)}
                      className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingPlaceholder(null)}
                      className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={() => setEditingPlaceholder({ index, value: "" })}
                    className="bg-yellow-200 border-2 border-yellow-500 rounded px-2 py-1 cursor-pointer hover:bg-yellow-300 font-mono text-sm"
                    title="Click para completar"
                  >
                    XXXXXX
                  </span>
                )}
              </span>
            )}
          </span>
        ))}
      </div>
    );
  };

  if (documentosSugeridos.length === 0) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#C026D3]" />
        Documentos Sugeridos
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Basados en el análisis, se sugieren los siguientes documentos. Los datos faltantes se marcan con <span className="bg-yellow-200 px-1 rounded font-mono">XXXXXX</span> y podés completarlos haciendo click.
      </p>
      
      <div className="space-y-2">
        {documentosSugeridos.map((doc: any, i: number) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 hover:border-[#C026D3]/40 transition">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{doc.tipo}</p>
                <p className="text-xs text-gray-500">{doc.descripcion}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleGenerateAndDownload(doc)}
                  disabled={generatingDoc === doc.tipo}
                  className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                  title="Generar y descargar en Word (.docx)"
                >
                  {generatingDoc === doc.tipo ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      Descargar Word
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleGenerateDocument(doc)}
                  disabled={generatingDoc === doc.tipo}
                  className="px-3 py-1.5 bg-[#C026D3] text-white text-xs font-medium rounded-lg hover:bg-[#A21CAF] disabled:opacity-50 flex items-center gap-1"
                  title="Generar y ver en pantalla"
                >
                  {generatingDoc === doc.tipo ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Ver
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal/Panel para mostrar documento generado */}
      {generatedDoc && (
        <div className="mt-4 border border-[#C026D3]/30 rounded-lg bg-purple-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900">{generatedDoc.tipo}</h5>
              {generatedDoc.tienePlaceholders && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ {generatedDoc.placeholdersCount} dato(s) pendiente(s) de completar
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {generatedDoc.tienePlaceholders && (
                <button
                  onClick={() => {
                    const value = prompt(`Ingresá el valor para reemplazar todos los XXXXXX:`);
                    if (value) {
                      handleReplaceAllPlaceholders(value);
                    }
                  }}
                  className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600"
                  title="Reemplazar todos los XXXXXX con el mismo valor"
                >
                  🔄 Completar todos
                </button>
              )}
              <button
                onClick={handleSaveDocument}
                className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
                title="Guardar documento en la bandeja"
              >
                {saved ? (
                  <>
                    ✓ Guardado
                  </>
                ) : (
                  <>
                    💾 Guardar
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  const content = editedContent || generatedDoc.contenido;
                  const filename = `${generatedDoc.tipo}_${new Date().toISOString().split('T')[0]}`;
                  await downloadMD(filename, content);
                }}
                className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
                title="Descargar en Word (.docx)"
              >
                <Download className="h-3 w-3" />
                Descargar Word
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(editedContent || generatedDoc.contenido);
                }}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                📋 Copiar
              </button>
              <button
                onClick={() => {
                  setGeneratedDoc(null);
                  setEditingPlaceholder(null);
                  setEditedContent("");
                  setSaved(false);
                }}
                className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 max-h-[500px] overflow-y-auto">
            {renderContentWithPlaceholders(editedContent || generatedDoc.contenido)}
          </div>
          {generatedDoc.datosExtraidos && Object.keys(generatedDoc.datosExtraidos).length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-900 mb-2">📊 Datos extraídos del análisis:</p>
              <div className="text-xs text-blue-800 space-y-1">
                {Object.entries(generatedDoc.datosExtraidos).map(([key, value]) => {
                  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
                  return (
                    <div key={key}>
                      <span className="font-medium">{key.replace(/_/g, " ")}:</span>{" "}
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente para mostrar el resultado del análisis con secciones
function AnalysisResultPanel({ 
  analysisResult, 
  analyzing, 
  documentId,
  onRegenerate,
  originalInstructions,
  setAnalyzing,
  setProgress,
  setStatusLabel,
  pollForResults
}: { 
  analysisResult: any; 
  analyzing: boolean;
  documentId: string | null;
  onRegenerate?: (docId: string) => void;
  originalInstructions?: string;
  setAnalyzing?: (value: boolean) => void;
  setProgress?: (value: number) => void;
  setStatusLabel?: (value: string) => void;
  pollForResults?: (docId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"resumen" | "clausulas" | "riesgos" | "recomendaciones" | "fuentes" | "chat">("resumen");
  const [chatMessages, setChatMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const API = useMemo(() => getApiUrl(), []);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Parsear el report si es string JSON
  const report = useMemo(() => {
    if (!analysisResult?.analysis?.report) {
      console.log("[AnalysisResultPanel] No hay report en analysisResult");
      return null;
    }
    const r = analysisResult.analysis.report;
    if (typeof r === 'string') {
      try {
        const parsed = JSON.parse(r);
        console.log("[AnalysisResultPanel] Report parseado:", parsed);
        console.log("[AnalysisResultPanel] clausulas_analizadas:", parsed?.clausulas_analizadas);
        console.log("[AnalysisResultPanel] riesgos:", parsed?.riesgos);
        console.log("[AnalysisResultPanel] proximos_pasos:", parsed?.proximos_pasos);
        return parsed;
      } catch {
        // Si no es JSON, devolver estructura con texto_formateado
        console.log("[AnalysisResultPanel] Report no es JSON válido, usando como texto");
        return { texto_formateado: r };
      }
    }
    console.log("[AnalysisResultPanel] Report es objeto:", r);
    console.log("[AnalysisResultPanel] clausulas_analizadas:", r?.clausulas_analizadas);
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

  const handleDownloadAnalysis = async () => {
    const content = report?.texto_formateado || 
                   report?.resumen_ejecutivo || 
                   (typeof analysisResult?.analysis?.report === 'string' 
                     ? analysisResult.analysis.report 
                     : JSON.stringify(analysisResult?.analysis?.report || {}, null, 2));
    const filename = report?.titulo || 
                    analysisResult?.filename || 
                    `analisis_${documentId || 'documento'}`;
    await downloadMD(filename, content);
  };

  // Función helper para fetch con timeout
  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  // Función para mostrar modal de confirmación con resumen
  const handleRegenerateClick = () => {
    if (chatMessages.length === 0) {
      // Si no hay chat, regenerar directamente
      handleRegenerateConfirm();
    } else {
      // Mostrar modal con resumen
      setShowRegenerateModal(true);
    }
  };

  // Función para confirmar regeneración
  const handleRegenerateConfirm = async () => {
    setShowRegenerateModal(false);
    setPendingRegenerate(true);
    
    if (!API || !documentId || regenerating) return;
    
    setRegenerating(true);
    
    // Ocultar el resultado anterior suavemente
    if (setAnalyzing) setAnalyzing(true);
    if (setProgress) setProgress(0);
    if (setStatusLabel) setStatusLabel("Regenerando análisis...");
    
    // Pequeño delay para transición suave
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // Extraer contexto del chat
      const chatContext = extractChatContext(chatMessages);
      
      console.log("[REGENERATE] Chat messages:", chatMessages);
      console.log("[REGENERATE] Extracted context:", chatContext);
      
      // Combinar instrucciones originales con contexto del chat
      // Si hay contexto del chat, tiene PRIORIDAD sobre las instrucciones originales
      const enhancedInstructions = chatContext 
        ? `CONTEXTO Y CONCLUSIONES DEL CHAT (APLICAR EN TODO EL ANÁLISIS):\n${chatContext}\n\n${originalInstructions ? `Instrucciones originales: ${originalInstructions}` : ""}`
        : (originalInstructions || "");
      
      console.log("[REGENERATE] Enhanced instructions to send:", enhancedInstructions);
      console.log("[REGENERATE] Instructions length:", enhancedInstructions.length);
      
      const instructionsToSend = enhancedInstructions.slice(0, 2000);
      console.log("[REGENERATE] Instructions after slice:", instructionsToSend);
      
      const analyzeResponse = await fetchWithTimeout(`${API}/legal/analyze/${documentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instructionsToSend ? { instructions: instructionsToSend } : {}),
      }, 30000);
      
      if (!analyzeResponse.ok) {
        throw new Error(`Error ${analyzeResponse.status}: ${await analyzeResponse.text()}`);
      }
      
      // Limpiar el chat después de regenerar
      setChatMessages([]);
      
      // Llamar al callback para iniciar polling del progreso
      if (onRegenerate && documentId) {
        onRegenerate(documentId);
      }
      
      // Si hay función de polling, iniciarla
      if (pollForResults && documentId) {
        pollForResults(documentId);
      }
    } catch (err: any) {
      console.error("Error al regenerar:", err);
      alert(`Error al regenerar el análisis: ${err.message || "Intenta de nuevo"}`);
      if (setAnalyzing) setAnalyzing(false);
    } finally {
      setRegenerating(false);
      setPendingRegenerate(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-4">
            <div>
          <h3 className="font-bold text-lg text-gray-900">Resultado del Análisis</h3>
          <p className="text-sm text-gray-500">
            {report?.tipo_documento || analysisResult.analysis.type} • {report?.jurisdiccion || "Nacional"} • {report?.area_legal || ""}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {chatMessages.length > 0 && (
            <>
              {/* Resumen de puntos clave que se aplicarán */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Sparkles className="h-3 w-3" />
                  Puntos clave del chat que se aplicarán al nuevo análisis:
                </p>
                <div className="space-y-1.5">
                  {extractKeyPointsFromChat(chatMessages).map((point, idx) => (
                    <div key={idx} className="text-xs text-purple-800 bg-white/60 rounded px-2 py-1">
                      {point}
                    </div>
                  ))}
                  {extractKeyPointsFromChat(chatMessages).length === 0 && (
                    <p className="text-xs text-purple-600 italic">Extrayendo puntos clave del chat...</p>
                  )}
                </div>
              </div>
              
              <button
                onClick={handleRegenerateClick}
                disabled={regenerating || pendingRegenerate}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
                title="Regenerar análisis con los criterios del chat"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Regenerando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Regenerar análisis</span>
                  </>
                )}
              </button>
              
              {/* Modal de confirmación con contexto completo del chat */}
              {showRegenerateModal && (() => {
                const chatContext = extractChatContext(chatMessages);
                return (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                      <h3 className="text-xl font-bold text-gray-900">Regenerar análisis con contexto del chat</h3>
                      
                      {/* Mostrar TODOS los mensajes del chat */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                        <p className="text-sm font-semibold text-gray-900 mb-3">Historial completo del chat:</p>
                        <div className="space-y-3">
                          {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`p-3 rounded-lg ${msg.role === "user" ? "bg-blue-50 border border-blue-200" : "bg-purple-50 border border-purple-200"}`}>
                              <p className="text-xs font-semibold mb-1 text-gray-700">
                                {msg.role === "user" ? "👤 Tu instrucción:" : "🤖 Respuesta del asistente:"}
                              </p>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Mostrar el contexto extraído que se enviará */}
                      {chatContext && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-purple-900 mb-2">📋 Contexto que se aplicará al análisis:</p>
                          <div className="bg-white rounded p-3 border border-purple-300">
                            <p className="text-xs text-purple-800 whitespace-pre-wrap font-mono">
                              {chatContext}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-blue-900 mb-1">⚠️ Importante:</p>
                        <p className="text-xs text-blue-800">
                          El análisis se regenerará completamente (OCR, traducción, clasificación, análisis de cláusulas, riesgos, fuentes y texto completo) incorporando TODAS las instrucciones y conclusiones del chat mostradas arriba.
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => setShowRegenerateModal(false)}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleRegenerateConfirm}
                          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          Confirmar regeneración
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
          <button
            onClick={handleDownloadAnalysis}
            className="flex items-center gap-2 px-4 py-2 bg-[#C026D3] hover:bg-[#A01FB8] text-white rounded-lg text-sm font-medium transition-colors"
            title="Descargar análisis completo en Word (.docx)"
          >
            <Download className="h-4 w-4" />
            Descargar Word
          </button>
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
  },
  {
    id: "comodato",
    nombre: "Contrato de Comodato",
    descripcion: "Préstamo de uso gratuito de bienes",
    campos: [
      { id: "comodante", label: "Comodante (quien presta)", tipo: "text", placeholder: "Juan Pérez" },
      { id: "comodatario", label: "Comodatario (quien recibe)", tipo: "text", placeholder: "María García" },
      { id: "bien", label: "Bien Prestado", tipo: "textarea", placeholder: "Vehículo, maquinaria, equipo..." },
      { id: "uso", label: "Uso Autorizado", tipo: "textarea", placeholder: "Uso personal, comercial, específico..." },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "6 meses" },
      { id: "condiciones", label: "Condiciones de Uso y Devolución", tipo: "textarea", placeholder: "Mantener en buen estado, devolver en fecha..." },
    ]
  },
  {
    id: "deposito",
    nombre: "Contrato de Depósito",
    descripcion: "Guardado y custodia de bienes",
    campos: [
      { id: "depositante", label: "Depositante", tipo: "text", placeholder: "Juan Pérez" },
      { id: "depositario", label: "Depositario", tipo: "text", placeholder: "Empresa de Almacenamiento S.A." },
      { id: "bienes", label: "Bienes Depositados", tipo: "textarea", placeholder: "Mercaderías, documentos, valores..." },
      { id: "lugar", label: "Lugar de Depósito", tipo: "text", placeholder: "Almacén ubicado en..." },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "Indefinido / 12 meses" },
      { id: "precio", label: "Precio del Depósito", tipo: "text", placeholder: "Gratuito / $X mensual" },
    ]
  },
  {
    id: "mandato",
    nombre: "Contrato de Mandato",
    descripcion: "Representación y gestión de negocios",
    campos: [
      { id: "mandante", label: "Mandante", tipo: "text", placeholder: "Juan Pérez" },
      { id: "mandatario", label: "Mandatario", tipo: "text", placeholder: "Dr. Carlos Abogado" },
      { id: "objeto", label: "Objeto del Mandato", tipo: "textarea", placeholder: "Gestionar trámites, representar en juicio..." },
      { id: "facultades", label: "Facultades", tipo: "textarea", placeholder: "Facultades específicas otorgadas..." },
      { id: "remuneracion", label: "Remuneración", tipo: "text", placeholder: "Gratuito / $X / % de comisión" },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "Indefinido / Hasta finalización del asunto" },
    ]
  },
  {
    id: "fianza",
    nombre: "Contrato de Fianza",
    descripcion: "Garantía personal de cumplimiento de obligaciones",
    campos: [
      { id: "fiador", label: "Fiador (quien garantiza)", tipo: "text", placeholder: "Juan Pérez" },
      { id: "deudor", label: "Deudor Principal", tipo: "text", placeholder: "María García" },
      { id: "acreedor", label: "Acreedor", tipo: "text", placeholder: "Banco X" },
      { id: "obligacion", label: "Obligación Garantizada", tipo: "textarea", placeholder: "Pago de préstamo, cumplimiento de contrato..." },
      { id: "monto", label: "Monto Garantizado", tipo: "text", placeholder: "$500.000" },
      { id: "tipo", label: "Tipo de Fianza", tipo: "select", opciones: ["Simple", "Solidaria", "Con beneficio de excusión"] },
    ]
  },
  {
    id: "leasing",
    nombre: "Contrato de Leasing",
    descripcion: "Arrendamiento financiero con opción de compra",
    campos: [
      { id: "arrendador", label: "Arrendador (Empresa de Leasing)", tipo: "text", placeholder: "Leasing S.A." },
      { id: "arrendatario", label: "Arrendatario", tipo: "text", placeholder: "Empresa Usuaria S.R.L." },
      { id: "bien", label: "Bien Arrendado", tipo: "textarea", placeholder: "Vehículo, maquinaria, equipos..." },
      { id: "valor", label: "Valor del Bien", tipo: "text", placeholder: "$2.000.000" },
      { id: "cuotas", label: "Cantidad de Cuotas", tipo: "number", placeholder: "36" },
      { id: "valor_cuota", label: "Valor de Cuota", tipo: "text", placeholder: "$80.000" },
      { id: "opcion_compra", label: "Precio de Opción de Compra", tipo: "text", placeholder: "$200.000" },
    ]
  },
  {
    id: "franchising",
    nombre: "Contrato de Franquicia",
    descripcion: "Licencia de marca y know-how comercial",
    campos: [
      { id: "franquiciante", label: "Franquiciante", tipo: "text", placeholder: "Marca X S.A." },
      { id: "franquiciado", label: "Franquiciado", tipo: "text", placeholder: "Local Y S.R.L." },
      { id: "marca", label: "Marca Franquiciada", tipo: "text", placeholder: "Nombre de la marca" },
      { id: "territorio", label: "Territorio Exclusivo", tipo: "text", placeholder: "Ciudad de Buenos Aires" },
      { id: "canon", label: "Canon Inicial", tipo: "text", placeholder: "$500.000" },
      { id: "royalty", label: "Royalty Mensual", tipo: "text", placeholder: "5% de ventas brutas" },
      { id: "plazo", label: "Plazo del Contrato", tipo: "text", placeholder: "5 años" },
    ]
  },
  {
    id: "distribucion",
    nombre: "Contrato de Distribución",
    descripcion: "Distribución exclusiva o no exclusiva de productos",
    campos: [
      { id: "proveedor", label: "Proveedor/Fabricante", tipo: "text", placeholder: "Fabricante S.A." },
      { id: "distribuidor", label: "Distribuidor", tipo: "text", placeholder: "Distribuidora X S.R.L." },
      { id: "productos", label: "Productos", tipo: "textarea", placeholder: "Línea completa de productos X..." },
      { id: "territorio", label: "Territorio", tipo: "text", placeholder: "Argentina / Región específica" },
      { id: "exclusividad", label: "Exclusividad", tipo: "select", opciones: ["Exclusiva", "No exclusiva", "Semi-exclusiva"] },
      { id: "comision", label: "Comisión/Margen", tipo: "text", placeholder: "20% sobre precio de venta" },
    ]
  },
  {
    id: "licencia_uso",
    nombre: "Contrato de Licencia de Uso",
    descripcion: "Licencia de software, marca o propiedad intelectual",
    campos: [
      { id: "licenciante", label: "Licenciante", tipo: "text", placeholder: "Empresa de Software S.A." },
      { id: "licenciatario", label: "Licenciatario", tipo: "text", placeholder: "Cliente S.R.L." },
      { id: "objeto", label: "Objeto de la Licencia", tipo: "textarea", placeholder: "Software X, marca Y, patente Z..." },
      { id: "alcance", label: "Alcance de la Licencia", tipo: "select", opciones: ["Uso exclusivo", "Uso no exclusivo", "Uso limitado"] },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "12 meses / Indefinido" },
      { id: "precio", label: "Precio de la Licencia", tipo: "text", placeholder: "$X mensual / Canon único" },
    ]
  },
  {
    id: "prestacion_servicios_tecnologicos",
    nombre: "Contrato de Prestación de Servicios Tecnológicos",
    descripcion: "Desarrollo de software, hosting, cloud, etc.",
    campos: [
      { id: "cliente", label: "Cliente", tipo: "text", placeholder: "Empresa Cliente S.A." },
      { id: "proveedor", label: "Proveedor de Servicios", tipo: "text", placeholder: "Tech Solutions S.R.L." },
      { id: "servicios", label: "Servicios a Prestar", tipo: "textarea", placeholder: "Desarrollo de aplicación web, hosting, mantenimiento..." },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "12 meses" },
      { id: "precio", label: "Precio", tipo: "text", placeholder: "$X mensual + IVA" },
      { id: "sla", label: "SLA (Service Level Agreement)", tipo: "textarea", placeholder: "99.9% uptime, respuesta en 24hs..." },
    ]
  },
  {
    id: "consultoria",
    nombre: "Contrato de Consultoría",
    descripcion: "Servicios de consultoría profesional",
    campos: [
      { id: "cliente", label: "Cliente", tipo: "text", placeholder: "Empresa Contratante S.A." },
      { id: "consultor", label: "Consultor", tipo: "text", placeholder: "Consultor Independiente" },
      { id: "objeto", label: "Objeto de la Consultoría", tipo: "textarea", placeholder: "Consultoría en estrategia, finanzas, legal..." },
      { id: "entregables", label: "Entregables", tipo: "textarea", placeholder: "Informe final, presentación, recomendaciones..." },
      { id: "honorarios", label: "Honorarios", tipo: "text", placeholder: "$X por hora / $X fijo" },
      { id: "plazo", label: "Plazo de Ejecución", tipo: "text", placeholder: "3 meses" },
    ]
  },
  {
    id: "obra",
    nombre: "Contrato de Obra",
    descripcion: "Construcción, refacción o ejecución de obra",
    campos: [
      { id: "comitente", label: "Comitente (Dueño)", tipo: "text", placeholder: "Juan Pérez" },
      { id: "contratista", label: "Contratista", tipo: "text", placeholder: "Constructora X S.A." },
      { id: "obra", label: "Descripción de la Obra", tipo: "textarea", placeholder: "Construcción de casa, refacción de departamento..." },
      { id: "lugar", label: "Lugar de la Obra", tipo: "text", placeholder: "Dirección completa" },
      { id: "precio", label: "Precio Total", tipo: "text", placeholder: "$5.000.000" },
      { id: "plazo", label: "Plazo de Ejecución", tipo: "text", placeholder: "6 meses" },
      { id: "garantia", label: "Garantía de la Obra", tipo: "text", placeholder: "12 meses" },
    ]
  },
  {
    id: "suministro",
    nombre: "Contrato de Suministro",
    descripcion: "Suministro continuado de bienes o servicios",
    campos: [
      { id: "proveedor", label: "Proveedor", tipo: "text", placeholder: "Proveedor S.A." },
      { id: "cliente", label: "Cliente", tipo: "text", placeholder: "Cliente S.R.L." },
      { id: "productos", label: "Productos/Servicios", tipo: "textarea", placeholder: "Materias primas, insumos, servicios..." },
      { id: "cantidad", label: "Cantidad/Volumen Estimado", tipo: "text", placeholder: "X unidades mensuales" },
      { id: "precio", label: "Precio Unitario", tipo: "text", placeholder: "$X por unidad" },
      { id: "plazo", label: "Plazo del Contrato", tipo: "text", placeholder: "12 meses" },
    ]
  },
  {
    id: "transporte",
    nombre: "Contrato de Transporte",
    descripcion: "Transporte de bienes o personas",
    campos: [
      { id: "transportista", label: "Transportista", tipo: "text", placeholder: "Transporte X S.A." },
      { id: "cargador", label: "Cargador/Remitente", tipo: "text", placeholder: "Empresa Remitente S.R.L." },
      { id: "destinatario", label: "Destinatario", tipo: "text", placeholder: "Empresa Destinataria S.A." },
      { id: "mercaderia", label: "Mercadería a Transportar", tipo: "textarea", placeholder: "Descripción de la carga..." },
      { id: "origen", label: "Origen", tipo: "text", placeholder: "Ciudad/Provincia" },
      { id: "destino", label: "Destino", tipo: "text", placeholder: "Ciudad/Provincia" },
      { id: "precio", label: "Precio del Transporte", tipo: "text", placeholder: "$X" },
    ]
  },
  {
    id: "seguro",
    nombre: "Contrato de Seguro",
    descripcion: "Póliza de seguro (vida, salud, automotor, etc.)",
    campos: [
      { id: "aseguradora", label: "Aseguradora", tipo: "text", placeholder: "Seguros X S.A." },
      { id: "asegurado", label: "Asegurado", tipo: "text", placeholder: "Juan Pérez" },
      { id: "tipo_seguro", label: "Tipo de Seguro", tipo: "select", opciones: ["Vida", "Salud", "Automotor", "Hogar", "Responsabilidad Civil", "Otro"] },
      { id: "objeto", label: "Objeto Asegurado", tipo: "textarea", placeholder: "Vehículo, vivienda, vida..." },
      { id: "suma_asegurada", label: "Suma Asegurada", tipo: "text", placeholder: "$X" },
      { id: "prima", label: "Prima", tipo: "text", placeholder: "$X mensual/anual" },
      { id: "vigencia", label: "Vigencia", tipo: "text", placeholder: "12 meses" },
    ]
  },
  {
    id: "donacion",
    nombre: "Contrato de Donación",
    descripcion: "Donación de bienes (con o sin cargo)",
    campos: [
      { id: "donante", label: "Donante", tipo: "text", placeholder: "Juan Pérez" },
      { id: "donatario", label: "Donatario", tipo: "text", placeholder: "María García / Institución" },
      { id: "bien", label: "Bien Donado", tipo: "textarea", placeholder: "Inmueble, dinero, bienes muebles..." },
      { id: "valor", label: "Valor Estimado", tipo: "text", placeholder: "$X" },
      { id: "cargo", label: "Cargo (si aplica)", tipo: "textarea", placeholder: "Obligación específica del donatario..." },
      { id: "aceptacion", label: "Aceptación", tipo: "select", opciones: ["Acepta", "Acepta con cargo", "Pendiente"] },
    ]
  },
  {
    id: "permuta",
    nombre: "Contrato de Permuta",
    descripcion: "Intercambio de bienes o derechos",
    campos: [
      { id: "parte_a", label: "Primera Parte", tipo: "text", placeholder: "Juan Pérez" },
      { id: "parte_b", label: "Segunda Parte", tipo: "text", placeholder: "María García" },
      { id: "bien_a", label: "Bien que Entrega Parte A", tipo: "textarea", placeholder: "Inmueble, vehículo, derechos..." },
      { id: "bien_b", label: "Bien que Entrega Parte B", tipo: "textarea", placeholder: "Inmueble, vehículo, derechos..." },
      { id: "diferencia", label: "Diferencia de Valor (si aplica)", tipo: "text", placeholder: "$X a favor de..." },
    ]
  },
  {
    id: "usufructo",
    nombre: "Contrato de Usufructo",
    descripcion: "Derecho de uso y goce de bien ajeno",
    campos: [
      { id: "nudo_propietario", label: "Nudo Propietario", tipo: "text", placeholder: "Juan Pérez" },
      { id: "usufructuario", label: "Usufructuario", tipo: "text", placeholder: "María García" },
      { id: "bien", label: "Bien sobre el que recae el Usufructo", tipo: "textarea", placeholder: "Inmueble, acciones, derechos..." },
      { id: "plazo", label: "Plazo del Usufructo", tipo: "text", placeholder: "Vitalicio / 20 años" },
      { id: "obligaciones", label: "Obligaciones del Usufructuario", tipo: "textarea", placeholder: "Mantener, conservar, pagar cargas..." },
    ]
  },
  {
    id: "cesion_derechos",
    nombre: "Cesión de Derechos",
    descripcion: "Cesión de créditos, derechos o acciones",
    campos: [
      { id: "cedente", label: "Cedente (quien cede)", tipo: "text", placeholder: "Juan Pérez" },
      { id: "cesionario", label: "Cesionario (quien recibe)", tipo: "text", placeholder: "María García" },
      { id: "derecho", label: "Derecho Cedido", tipo: "textarea", placeholder: "Crédito, acción, derecho de propiedad intelectual..." },
      { id: "monto", label: "Monto/Valor", tipo: "text", placeholder: "$X" },
      { id: "precio_cesion", label: "Precio de la Cesión", tipo: "text", placeholder: "$X" },
      { id: "deudor", label: "Deudor (si aplica)", tipo: "text", placeholder: "Empresa Deudora S.A." },
    ]
  },
  {
    id: "prenda",
    nombre: "Contrato de Prenda",
    descripcion: "Garantía prendaria sobre bienes muebles",
    campos: [
      { id: "deudor", label: "Deudor/Prendante", tipo: "text", placeholder: "Juan Pérez" },
      { id: "acreedor", label: "Acreedor/Prendatario", tipo: "text", placeholder: "Banco X" },
      { id: "bien", label: "Bien Dado en Prenda", tipo: "textarea", placeholder: "Vehículo, maquinaria, acciones..." },
      { id: "obligacion", label: "Obligación Garantizada", tipo: "textarea", placeholder: "Préstamo, deuda comercial..." },
      { id: "monto", label: "Monto Garantizado", tipo: "text", placeholder: "$X" },
    ]
  },
  {
    id: "hipoteca",
    nombre: "Contrato de Hipoteca",
    descripcion: "Garantía hipotecaria sobre inmuebles",
    campos: [
      { id: "deudor", label: "Deudor/Hipotecante", tipo: "text", placeholder: "Juan Pérez" },
      { id: "acreedor", label: "Acreedor/Hipotecario", tipo: "text", placeholder: "Banco X" },
      { id: "inmueble", label: "Inmueble Hipotecado", tipo: "textarea", placeholder: "Dirección completa, partida, matrícula..." },
      { id: "obligacion", label: "Obligación Garantizada", tipo: "textarea", placeholder: "Préstamo hipotecario..." },
      { id: "monto", label: "Monto Garantizado", tipo: "text", placeholder: "$X" },
    ]
  },
  {
    id: "sociedad_hecho",
    nombre: "Sociedad de Hecho",
    descripcion: "Acuerdo entre socios sin constitución formal",
    campos: [
      { id: "socios", label: "Socios", tipo: "textarea", placeholder: "Juan Pérez (50%), María García (50%)" },
      { id: "objeto", label: "Objeto", tipo: "textarea", placeholder: "Actividad comercial a desarrollar..." },
      { id: "aportes", label: "Aportes de Cada Socio", tipo: "textarea", placeholder: "Juan: $X, María: $Y" },
      { id: "distribucion", label: "Distribución de Utilidades", tipo: "text", placeholder: "50% - 50%" },
      { id: "administracion", label: "Administración", tipo: "textarea", placeholder: "Decisión conjunta, administrador único..." },
    ]
  },
  {
    id: "joint_venture",
    nombre: "Joint Venture / Asociación Estratégica",
    descripcion: "Asociación temporal para proyecto específico",
    campos: [
      { id: "parte_a", label: "Primera Parte", tipo: "text", placeholder: "Empresa A S.A." },
      { id: "parte_b", label: "Segunda Parte", tipo: "text", placeholder: "Empresa B S.R.L." },
      { id: "proyecto", label: "Proyecto/Objetivo", tipo: "textarea", placeholder: "Desarrollo conjunto de producto, entrada a mercado..." },
      { id: "aportes", label: "Aportes de Cada Parte", tipo: "textarea", placeholder: "Parte A: $X y tecnología, Parte B: $Y y distribución" },
      { id: "distribucion", label: "Distribución de Beneficios", tipo: "text", placeholder: "50% - 50%" },
      { id: "plazo", label: "Plazo del Joint Venture", tipo: "text", placeholder: "24 meses" },
    ]
  },
  {
    id: "confidencialidad_empleado",
    nombre: "Acuerdo de Confidencialidad con Empleado",
    descripcion: "NDA específico para empleados",
    campos: [
      { id: "empleador", label: "Empleador", tipo: "text", placeholder: "Empresa S.A." },
      { id: "empleado", label: "Empleado", tipo: "text", placeholder: "Juan Pérez" },
      { id: "info_confidencial", label: "Información Confidencial", tipo: "textarea", placeholder: "Secretos comerciales, clientes, procesos..." },
      { id: "vigencia", label: "Vigencia Post-Empleo", tipo: "text", placeholder: "2 años después del cese" },
    ]
  },
  {
    id: "no_competencia",
    nombre: "Acuerdo de No Competencia",
    descripcion: "Cláusula de no competencia post-empleo",
    campos: [
      { id: "empleador", label: "Empleador", tipo: "text", placeholder: "Empresa S.A." },
      { id: "empleado", label: "Empleado", tipo: "text", placeholder: "Juan Pérez" },
      { id: "actividad", label: "Actividad Prohibida", tipo: "textarea", placeholder: "No trabajar en empresas competidoras..." },
      { id: "territorio", label: "Territorio", tipo: "text", placeholder: "Ciudad de Buenos Aires" },
      { id: "plazo", label: "Plazo", tipo: "text", placeholder: "12 meses después del cese" },
      { id: "compensacion", label: "Compensación (si aplica)", tipo: "text", placeholder: "$X mensual durante el plazo" },
    ]
  },
  {
    id: "mediacion",
    nombre: "Acuerdo de Mediación",
    descripcion: "Acuerdo para resolver conflictos mediante mediación",
    campos: [
      { id: "parte_a", label: "Primera Parte", tipo: "text", placeholder: "Juan Pérez" },
      { id: "parte_b", label: "Segunda Parte", tipo: "text", placeholder: "María García" },
      { id: "conflicto", label: "Naturaleza del Conflicto", tipo: "textarea", placeholder: "Describir el conflicto a mediar..." },
      { id: "mediador", label: "Mediador", tipo: "text", placeholder: "Dr. Carlos Mediador" },
      { id: "plazo", label: "Plazo para la Mediación", tipo: "text", placeholder: "60 días" },
    ]
  },
  {
    id: "arbitraje",
    nombre: "Acuerdo de Arbitraje",
    descripcion: "Sometimiento a arbitraje para resolver conflictos",
    campos: [
      { id: "parte_a", label: "Primera Parte", tipo: "text", placeholder: "Empresa A S.A." },
      { id: "parte_b", label: "Segunda Parte", tipo: "text", placeholder: "Empresa B S.R.L." },
      { id: "materia", label: "Materia Arbitrable", tipo: "textarea", placeholder: "Conflictos derivados del contrato..." },
      { id: "arbitro", label: "Árbitro/Institución Arbitral", tipo: "text", placeholder: "Cámara de Arbitraje X" },
      { id: "procedimiento", label: "Procedimiento", tipo: "select", opciones: ["Arbitraje de derecho", "Arbitraje de equidad"] },
    ]
  },
  {
    id: "escritura_publica",
    nombre: "Minuta para Escritura Pública",
    descripcion: "Minuta para elevación a escritura pública",
    campos: [
      { id: "tipo_operacion", label: "Tipo de Operación", tipo: "select", opciones: ["Compraventa", "Donación", "Permuta", "Constitución de sociedad", "Otro"] },
      { id: "partes", label: "Partes", tipo: "textarea", placeholder: "Vendedor: X, Comprador: Y..." },
      { id: "bien", label: "Bien/Objeto", tipo: "textarea", placeholder: "Inmueble, derechos, sociedad..." },
      { id: "precio", label: "Precio (si aplica)", tipo: "text", placeholder: "$X" },
      { id: "condiciones", label: "Condiciones Especiales", tipo: "textarea", placeholder: "Condiciones específicas de la operación..." },
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
        formData.append("tipoDocumento", type === "memo" ? "Transcripción de reunión" : type);
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
                      tipoDocumento: "Transcripción de reunión",
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
    <div className="w-full">
      {/* Header mejorado */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-bold text-2xl text-gray-900 mb-1">Generar Documento</h3>
        <p className="text-sm text-gray-600">Generación de memos, dictámenes, contratos y documentos legales</p>
      </div>
      
      {/* Tabs para elegir modo mejorados */}
      <div className="flex gap-2 mb-6 border-b-2 border-gray-200">
        <button
          type="button"
          onClick={() => setModoGeneracion("memo")}
          className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${
            modoGeneracion === "memo"
              ? "border-[#C026D3] text-[#C026D3] bg-purple-50/50"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          Reuniones / Dictámenes
        </button>
        <button
          type="button"
          onClick={() => setModoGeneracion("plantilla")}
          className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${
            modoGeneracion === "plantilla"
              ? "border-[#C026D3] text-[#C026D3] bg-purple-50/50"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          Contratos / Plantillas
        </button>
      </div>

      {modoGeneracion === "plantilla" ? (
        <GenerarDesdePlantilla onGenerated={onGenerated} setError={setError} setLoading={setLoading} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna izquierda: Formulario - Ocupa 2 columnas */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de documento</label>
            <select className="w-full bg-white border-2 border-gray-300 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" value={type} onChange={e=>setType(e.target.value as any)}>
              <option value="memo">Transcripción de reunión</option>
              <option value="dictamen">Dictamen</option>
              <option value="contrato">Contrato</option>
              <option value="escrito">Escrito</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Área legal</label>
            <select className="w-full bg-white border-2 border-gray-300 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" value={areaLegal} onChange={e=>setAreaLegal(e.target.value as any)}>
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
          <label className="block text-sm font-semibold text-gray-700 mb-2">Título</label>
          <input className="w-full bg-white border-2 border-gray-300 rounded-lg py-2.5 px-4 text-sm placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" placeholder="Ej.: Aplicación del art. 765 CCyC en mutuo USD" value={title} onChange={e=>setTitle(e.target.value)} type="text"/>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Instrucciones</label>
          <textarea className="w-full bg-white border-2 border-gray-300 rounded-lg py-2.5 px-4 text-sm placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-y" placeholder="Hechos, contexto, puntos a resolver, tono, jurisdicción..." rows={5} value={instructions} onChange={e=>setInstructions(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Transcripción (PDF opcional)</label>
          <div 
            className="flex justify-center px-6 pt-8 pb-8 border-2 border-gray-300 border-dashed rounded-lg bg-gray-50/50 hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer"
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
              <label className="ml-2 block text-sm text-gray-800" htmlFor="use-rag">Usar generador de reuniones sin RAG</label>
        </div>
        {file && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
            <div className="text-blue-900 font-medium mb-1">💡 Modo Chat disponible</div>
            <div className="text-blue-700 text-xs">Con el archivo subido, también podés usar el modo chat para consultar paso a paso cómo proceder.</div>
          </div>
        )}
        <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
          <button 
            className="px-6 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors" 
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
            Limpiar
          </button>
          <button 
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-2.5 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
            type="submit"
            disabled={loadingLocal}
          >
            {loadingLocal ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>Generar Documento</span>
              </>
            )}
          </button>
        </div>
      </form>
          </div>
        </div>

        {/* Columna derecha: Preview del Dictamen o Resultado - Ocupa 1 columna */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 sticky top-6">
          {memoResult ? (
            <MemoResultPanel 
              memoResult={memoResult}
              onRegenerate={(newResult) => {
                setMemoResult(newResult);
                // También actualizar en la bandeja si es necesario
                const citations = (newResult.citas || []).map((c: any) => ({
                  title: c.referencia || c.descripcion || "(sin título)",
                  source: c.tipo || "otra",
                  url: c.url || undefined,
                  descripcion: c.descripcion || undefined,
                  tipo: c.tipo || "otra",
                  referencia: c.referencia || c.descripcion || "(sin título)"
                }));
                const memoId = crypto.randomUUID();
                onGenerated({ 
                  id: memoId,
                  type: "memo", 
                  title: title || newResult.titulo, 
                  markdown: newResult.texto_formateado, 
                  memoData: {
                    ...newResult,
                    areaLegal: areaLegal,
                    transcriptText: transcriptText || (file ? "PDF subido" : ""),
                    citas: newResult.citas || []
                  },
                  citations: citations,
                  transcriptText: transcriptText || (file ? "PDF subido" : ""),
                  tipoDocumento: "Transcripción de reunión",
                  areaLegal: areaLegal,
                  createdAt: new Date().toISOString()
                });
              }}
              originalFile={file}
              originalTranscriptText={transcriptText}
              originalTitle={title}
              originalInstructions={instructions}
              originalAreaLegal={areaLegal}
              originalType={type}
            />
          ) : (
            <>
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
            </>
          )}
        </div>

      {/* Indicador de progreso moderno */}
      {loadingLocal && (
        <ProgressIndicator />
      )}
      </div>
      )}
    </div>
  );
}

// Componente para mostrar el resultado del memo con pestañas
function MemoResultPanel({ 
  memoResult, 
  onRegenerate,
  originalFile,
  originalTranscriptText,
  originalTitle,
  originalInstructions,
  originalAreaLegal,
  originalType
}: { 
  memoResult: any;
  onRegenerate?: (newResult: any) => void;
  originalFile?: File | null;
  originalTranscriptText?: string;
  originalTitle?: string;
  originalInstructions?: string;
  originalAreaLegal?: string;
  originalType?: string;
}) {
  const [activeTab, setActiveTab] = useState<"resumen" | "puntos" | "riesgos" | "recomendaciones" | "fuentes">("resumen");
  const [chatMessages, setChatMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
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
      titulo: memoResult.titulo || "Transcripción de Reunión",
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

  // Función para regenerar el análisis con contexto del chat
  const handleRegenerate = async () => {
    if (!API || regenerating) return;
    
    setRegenerating(true);
    try {
      // Extraer contexto del chat
      const chatContext = extractChatContext(chatMessages);
      
      // Combinar instrucciones originales con contexto del chat
      const enhancedInstructions = chatContext 
        ? `${originalInstructions || ""}\n\n--- CONTEXTO DEL CHAT ---\n${chatContext}`
        : (originalInstructions || "");
      
      const formData = new FormData();
      formData.append("tipoDocumento", originalType === "memo" ? "Transcripción de reunión" : (originalType || "memo"));
      formData.append("titulo", originalTitle || memoResult.titulo || "");
      formData.append("instrucciones", enhancedInstructions);
      formData.append("areaLegal", originalAreaLegal || memoResult.areaLegal || "civil_comercial");
      
      // Prioridad: PDF primero, luego texto
      if (originalFile) {
        formData.append("transcripcion", originalFile);
      } else if (originalTranscriptText?.trim()) {
        formData.append("transcriptText", originalTranscriptText);
      }
      
      const r = await fetch(`${API}/api/memos/generate`, {
        method: "POST",
        body: formData
      });
      
      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`Error ${r.status}: ${errorText || "Error al regenerar"}`);
      }
      
      const data = await r.json();
      
      // Llamar al callback si existe
      if (onRegenerate) {
        onRegenerate(data);
      }
      
      // Limpiar el chat después de regenerar
      setChatMessages([]);
    } catch (err: any) {
      console.error("Error al regenerar:", err);
      alert(`Error al regenerar el análisis: ${err.message || "Intenta de nuevo"}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Mostrar indicador de progreso cuando se está regenerando
  if (regenerating) {
    return (
      <div className="w-full">
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="font-bold text-lg text-gray-900 mb-4">Regenerando análisis...</h3>
          <ProgressIndicator />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
                <div>
          <h3 className="font-bold text-lg text-gray-900">Resultado de la Reunión</h3>
          <p className="text-sm text-gray-500">
            {memoResult.titulo || "Transcripción de Reunión"} • {memoResult.areaLegal?.replace(/_/g, " ") || ""}
          </p>
        </div>
        {chatMessages.length > 0 && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-2 px-4 py-2 bg-[#C026D3] text-white text-sm font-medium rounded-lg hover:bg-[#A21CAF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Regenerar análisis con los criterios del chat"
          >
            {regenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Regenerando...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Regenerar análisis</span>
              </>
            )}
          </button>
        )}
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
      <div className="max-h-[700px] overflow-y-auto">
        {activeTab === "resumen" && (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">{memoResult.titulo || memoResult.titulo || "Transcripción de Reunión"}</h4>
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
                  <p className="text-xs text-gray-400">Hacé preguntas sobre la transcripción generada</p>
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

// Componente de chat para documento personalizado
function ChatDocumentoPersonalizado({ 
  onGenerar, 
  onVolver, 
  onGuardarTemplate,
  setError,
  setLoading 
}: { 
  onGenerar: (docData: { descripcion: string; detalles: Record<string, any>; titulo: string }) => void;
  onVolver: () => void;
  onGuardarTemplate: (templateData: { nombre: string; descripcion: string; campos: any[] }) => void;
  setError: (e: string | null) => void;
  setLoading: (b: boolean) => void;
}) {
  const [messages, setMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [loading, setLoadingLocal] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [documentoGenerado, setDocumentoGenerado] = useState<string | null>(null);
  const [tituloDocumento, setTituloDocumento] = useState<string>("Documento Personalizado");
  const [downloading, setDownloading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const API = useMemo(() => getApiUrl(), []);

  // Mensaje inicial del asistente
  useEffect(() => {
    if (messages.length === 0) {
      const mensajeInicial = {
        role: "assistant" as const,
        content: "¡Hola! 👋 Soy tu asistente para crear documentos personalizados. Por favor, describime qué tipo de documento necesitás crear. Sé lo más específico posible: tipo de documento, partes involucradas, objeto, condiciones principales, etc."
      };
      setMessages([mensajeInicial]);
    }
  }, []);

  // Scroll automático al final cuando se agregan nuevos mensajes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !API || loading) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage("");
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setLoadingLocal(true);

    try {
      const response = await fetch(`${API}/api/chat-custom-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = { role: "assistant" as const, content: data.message || data.response };
      setMessages([...newMessages, assistantMessage]);

    } catch (e: any) {
      setError(e.message || "Error en el chat");
      const errorMessage = { role: "assistant" as const, content: `Error: ${e.message || "Error al procesar tu mensaje"}` };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleGenerar = async () => {
    if (messages.length < 2) {
      setError("Por favor, describe primero el documento que necesitas crear.");
      return;
    }

    setGenerando(true);
    setLoading(true);
    setError(null);

    try {
      // Extraer información del chat: combinar todos los mensajes del usuario
      const userMessages = messages.filter(m => m.role === "user").map(m => m.content).join("\n");
      
      // Intentar extraer título del primer mensaje o usar uno genérico
      const tituloMatch = userMessages.match(/(?:necesito|quiero|requiero).*?(?:contrato|acuerdo|documento|carta|escrito)/i);
      const titulo = tituloMatch ? tituloMatch[0] : "Documento Personalizado";

      // Extraer detalles básicos del chat
      const detalles: Record<string, any> = {};
      const partesMatch = userMessages.match(/(?:partes?|entre|con)\s+([^\.]+)/i);
      if (partesMatch) detalles.partes = partesMatch[1];
      
      const objetoMatch = userMessages.match(/(?:objeto|para|sobre)\s+([^\.]+)/i);
      if (objetoMatch) detalles.objeto = objetoMatch[1];

      const response = await fetch(`${API}/api/generate-custom-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descripcion: userMessages,
          detalles: detalles,
          titulo: titulo
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}`);
      }

      const data = await response.json();
      
      // Guardar el documento generado para poder descargarlo después
      setDocumentoGenerado(data.documento || "");
      setTituloDocumento(data.titulo || titulo);
      
      // Agregar mensaje del asistente con el documento generado
      const documentoMessage = {
        role: "assistant" as const,
        content: `✅ **Documento generado exitosamente!**\n\n${data.documento || ""}\n\n¿Querés hacer algún cambio o ajuste al documento? Podés pedirme modificaciones, agregar cláusulas, o ajustar cualquier aspecto.`
      };
      setMessages([...messages, documentoMessage]);
      
      // NO llamar a onGenerar aquí para mantener el chat visible
      // El documento ya está guardado en documentoGenerado y mostrado en el chat

    } catch (e: any) {
      setError(e.message || "Error al generar documento");
    } finally {
      setGenerando(false);
      setLoading(false);
    }
  };

  // Función para generar documento actualizado con recomendaciones del chat
  const generateUpdatedDocument = (originalText: string, chatMessages: Array<{role: "user" | "assistant"; content: string}>): string => {
    if (chatMessages.length === 0 || !originalText) {
      return originalText;
    }

    // Extraer recomendaciones y modificaciones del chat
    const assistantMessages = chatMessages.filter(m => m.role === "assistant").map(m => m.content);
    const userQuestions = chatMessages.filter(m => m.role === "user").map(m => m.content);
    
    // Buscar secciones de recomendaciones y acciones sugeridas
    const recomendaciones: string[] = [];
    const modificaciones: string[] = [];
    const resumenCambios: string[] = [];

    assistantMessages.forEach(msg => {
      // Buscar "Acciones Sugeridas" o "Recomendaciones"
      const accionesMatch = msg.match(/(?:Acciones sugeridas|Recomendaciones|Sugerencias):?\s*\n([\s\S]*?)(?=\n\n|$)/i);
      if (accionesMatch) {
        recomendaciones.push(accionesMatch[1].trim());
      }

      // Buscar modificaciones o cambios sugeridos
      const modificacionesMatch = msg.match(/(?:modificar|cambiar|actualizar|revisar|ajustar).*?[:\n]([\s\S]*?)(?=\n\n|$)/i);
      if (modificacionesMatch) {
        modificaciones.push(modificacionesMatch[1].trim());
      }

      // Si el mensaje contiene recomendaciones pero no está en formato estructurado, agregarlo
      if (msg.includes("recomend") || msg.includes("suger") || msg.includes("debería")) {
        if (!recomendaciones.some(r => r.includes(msg.substring(0, 100)))) {
          recomendaciones.push(msg);
        }
      }
    });

    // Generar resumen de cambios basado en las preguntas del usuario y respuestas
    if (userQuestions.length > 0) {
      resumenCambios.push(`Se discutieron ${userQuestions.length} temas en el chat:`);
      userQuestions.forEach((q, i) => {
        resumenCambios.push(`${i + 1}. ${q.substring(0, 100)}${q.length > 100 ? "..." : ""}`);
      });
    }

    // Construir documento actualizado
    let documentoActualizado = originalText;

    // Agregar secciones nuevas si hay contenido del chat
    if (recomendaciones.length > 0 || modificaciones.length > 0 || resumenCambios.length > 0) {
      documentoActualizado += "\n\n\n";
      documentoActualizado += "═══════════════════════════════════════════════════════════════════════════════\n";
      documentoActualizado += "RECOMENDACIONES Y MODIFICACIONES DEL CHAT\n";
      documentoActualizado += "═══════════════════════════════════════════════════════════════════════════════\n\n";

      if (recomendaciones.length > 0) {
        documentoActualizado += "=== RECOMENDACIONES DEL CHAT ===\n\n";
        recomendaciones.forEach((rec, i) => {
          documentoActualizado += `${i + 1}. ${rec}\n\n`;
        });
        documentoActualizado += "\n";
      }

      if (modificaciones.length > 0) {
        documentoActualizado += "=== MODIFICACIONES SUGERIDAS ===\n\n";
        modificaciones.forEach((mod, i) => {
          documentoActualizado += `${i + 1}. ${mod}\n\n`;
        });
        documentoActualizado += "\n";
      }

      if (resumenCambios.length > 0) {
        documentoActualizado += "=== RESUMEN DE CAMBIOS DISCUTIDOS ===\n\n";
        resumenCambios.forEach(cambio => {
          documentoActualizado += `${cambio}\n`;
        });
        documentoActualizado += "\n";
      }

      // Si no se encontraron recomendaciones estructuradas, agregar todas las respuestas del asistente
      if (recomendaciones.length === 0 && modificaciones.length === 0 && assistantMessages.length > 0) {
        documentoActualizado += "=== RECOMENDACIONES Y SUGERENCIAS DEL CHAT ===\n\n";
        assistantMessages.forEach((msg, i) => {
          documentoActualizado += `Recomendación ${i + 1}:\n${msg}\n\n`;
        });
      }
    }

    return documentoActualizado;
  };

  // Función para descargar documento actualizado con recomendaciones del chat
  const handleDownloadWithChat = async () => {
    if (!API || downloading || !documentoGenerado) return;
    
    setDownloading(true);
    try {
      // Generar documento actualizado
      const documentoActualizado = generateUpdatedDocument(documentoGenerado, messages);
      
      // Descargar en Word usando downloadMD
      const sanitize = (s: string) => s.replace(/[^a-z0-9\-\_\ ]/gi, "_");
      const filename = `${tituloDocumento}_actualizado_${new Date().toISOString().split("T")[0]}`;
      
      await downloadMD(filename, documentoActualizado);
    } catch (error) {
      console.error("Error al descargar documento actualizado:", error);
      setError("Error al generar Word. Intenta de nuevo.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">📝 Documento Personalizado</h4>
          <p className="text-xs text-gray-500">Describe tu documento y el asistente te ayudará a crearlo</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botón Descargar Word con recomendaciones del chat - Siempre visible */}
          {documentoGenerado && (
            <button
              onClick={handleDownloadWithChat}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              title="Descargar documento actualizado con recomendaciones del chat en Word (.docx)"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Generando...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Descargar Word</span>
                  <span className="sm:hidden">Word</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={onVolver}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Volver a plantillas
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="border border-gray-200 rounded-lg bg-white" style={{ maxHeight: "500px", display: "flex", flexDirection: "column" }}>
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-[#C026D3] text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {msg.content.includes("**Documento generado exitosamente!**") ? (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-green-700 mb-2">✅ Documento generado exitosamente!</div>
                    <div className="bg-white rounded-lg p-4 border border-gray-300 max-h-96 overflow-y-auto">
                      <div className="text-sm prose prose-sm max-w-none">
                        <ReactMarkdown>
                          {msg.content.replace(/✅ \*\*Documento generado exitosamente!\*\*\n\n/, "").split("\n\n¿Querés hacer")[0]}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={async () => {
                          if (!documentoGenerado) return;
                          setDownloading(true);
                          try {
                            const sanitize = (s: string) => s.replace(/[^a-z0-9\-\_\ ]/gi, "_");
                            const filename = `${tituloDocumento}_${new Date().toISOString().split("T")[0]}`;
                            await downloadMD(filename, documentoGenerado);
                          } catch (error) {
                            setError("Error al descargar documento");
                          } finally {
                            setDownloading(false);
                          }
                        }}
                        disabled={downloading || !documentoGenerado}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Generando...</span>
                          </>
                        ) : (
                          <>
                            <Download className="h-3 w-3" />
                            <span>Descargar Word</span>
                          </>
                        )}
                      </button>
                    </div>
                    {msg.content.includes("¿Querés hacer") && (
                      <div className="text-sm text-gray-700 mt-2">
                        {msg.content.split("¿Querés hacer")[1]}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder="Escribe tu mensaje..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#C026D3] focus:border-[#C026D3]"
              disabled={loading || generando}
            />
            <button
              onClick={handleSendMessage}
              disabled={loading || !currentMessage.trim() || generando}
              className="bg-[#C026D3] text-white px-4 py-2 rounded-lg hover:bg-[#A21CAF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Botón de generar - Solo mostrar si NO hay documento generado todavía */}
      {messages.length >= 2 && !documentoGenerado && (
        <div className="border border-[#C026D3] bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">¿Listo para generar el documento?</p>
              <p className="text-xs text-gray-600">Revisá la conversación y cuando tengas toda la información, generá el documento.</p>
            </div>
            <button
              onClick={handleGenerar}
              disabled={generando || loading}
              className="bg-[#C026D3] text-white px-6 py-2 rounded-lg hover:bg-[#A21CAF] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {generando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generar Documento</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Mensaje después de generar - Permitir seguir chateando */}
      {documentoGenerado && (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <p className="text-sm font-medium text-green-900 mb-2">✅ Documento generado</p>
          <p className="text-xs text-green-700">Podés seguir chateando para pedir modificaciones, agregar cláusulas o hacer ajustes al documento.</p>
        </div>
      )}
    </div>
  );
}

// Componente para generar documentos desde plantillas
function GenerarDesdePlantilla({ onGenerated, setError, setLoading }: { onGenerated: (out: any)=>void; setError: (e:string|null)=>void; setLoading: (b:boolean)=>void; }) {
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<typeof PLANTILLAS_DOCUMENTOS[0] | null>(null);
  const [modoPersonalizado, setModoPersonalizado] = useState(false); // Nuevo: modo para documento personalizado
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

  // handleGenerarPersonalizado ahora se maneja dentro de ChatDocumentoPersonalizado

  const handleGuardarTemplate = async (templateData: { nombre: string; descripcion: string; campos: any[] }) => {
    if (!API) return;
    
    try {
      const response = await fetch(`${API}/api/save-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}`);
      }

      alert("✅ Plantilla guardada exitosamente. Estará disponible en la lista de plantillas.");
    } catch (e: any) {
      setError(e.message || "Error al guardar plantilla");
    }
  };

  // Vista de selección de plantilla
  if (!plantillaSeleccionada && !modoPersonalizado) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 mb-4">Seleccioná una plantilla para comenzar:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Opción especial: Documento Personalizado */}
          <button
            onClick={() => setModoPersonalizado(true)}
            className="p-4 border-2 border-dashed border-[#C026D3] rounded-lg hover:border-solid hover:bg-[#C026D3]/10 transition-all text-left group bg-gradient-to-br from-purple-50 to-pink-50"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-[#C026D3]" />
              <div className="font-medium text-gray-900 group-hover:text-[#C026D3]">📝 Documento Personalizado</div>
            </div>
            <div className="text-xs text-gray-600 mt-1">Describe un documento específico que no esté en las plantillas. El asistente te ayudará a crearlo paso a paso.</div>
          </button>
          
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

  // Vista de chat para documento personalizado
  if (modoPersonalizado && !plantillaSeleccionada) {
    return <ChatDocumentoPersonalizado 
      onGenerar={async (docData) => {
        // Generar documento desde chat
        if (!API) return;
        
        setLoadingLocal(true);
        setLoading(true);
        setError(null);

        try {
          const response = await fetch(`${API}/api/generate-custom-document`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              descripcion: docData.descripcion,
              detalles: docData.detalles,
              titulo: docData.titulo
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Error ${response.status}`);
          }

          const data = await response.json();
          setResultado(data.documento);
          
          // NO volver a modo normal - mantener el chat visible
          // El documento se muestra en el chat y el usuario puede seguir pidiendo cambios
          // setModoPersonalizado(false); // COMENTADO: mantener el chat visible
          
          // Opcional: agregar a la bandeja local sin salir del chat
          // onGenerated({
          //   id: crypto.randomUUID(),
          //   type: "contrato",
          //   title: docData.titulo || `Documento Personalizado - ${new Date().toLocaleDateString()}`,
          //   markdown: data.documento,
          //   createdAt: new Date().toISOString(),
          //   esPersonalizado: true,
          //   descripcion: docData.descripcion,
          //   detalles: docData.detalles
          // });

        } catch (e: any) {
          setError(e.message || "Error al generar documento personalizado");
        } finally {
          setLoadingLocal(false);
          setLoading(false);
        }
      }}
      onVolver={() => {
        setModoPersonalizado(false);
        setResultado(null);
      }}
      onGuardarTemplate={(templateData) => {
        // Fase 2: Guardar como template (postergado)
        console.log("Guardar template (Fase 2):", templateData);
      }}
      setError={setError}
      setLoading={setLoading}
    />;
  }

  // Vista de formulario de plantilla
  if (!plantillaSeleccionada) return null;
  
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
                a.download = `${plantillaSeleccionada?.nombre?.replace(/\s+/g, "_") || "documento"}_${new Date().toISOString().split("T")[0]}.txt`;
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
              Iniciando conversación sobre la transcripción generada...
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
