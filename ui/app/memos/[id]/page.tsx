"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, MessageSquare, FileText, AlertTriangle, ListChecks, TrendingUp, BookOpen, Send, Library, Download, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { MemoSuggestedDocuments } from "@/components/MemoSuggestedDocuments";

/**
 * Vista tipo NotebookLM para cada memo generado
 * Muestra el contenido del memo en la izquierda y chat en la derecha
 */

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
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

export default function MemoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memoId = params.id as string;
  const [memo, setMemo] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"resumen" | "puntos" | "pasos" | "fuentes" | "riesgos" | "citas" | "texto">("resumen");
  const [copied, setCopied] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  // Cargar memo desde localStorage o API
  useEffect(() => {
    const loadMemo = async () => {
      try {
        // 1. Primero buscar en localStorage (memos locales)
        const saved = localStorage.getItem("legal-memos");
        if (saved) {
          const memos = JSON.parse(saved);
          const found = memos.find((m: any) => m.id === memoId);
          if (found) {
            setMemo(found);
            return;
          }
        }

        // 2. Si no se encuentra en localStorage, buscar en la API (análisis de documentos)
        if (API) {
          try {
            const response = await fetch(`${API}/legal/result/${memoId}`);
            if (response.ok) {
              const result = await response.json();
              
              // Si el documento existe pero no tiene análisis, mostrar mensaje
              if (!result.analysis) {
                const deletedMemo = {
                  id: result.documentId || memoId,
                  title: result.filename || 'Documento',
                  asunto: result.filename || 'Documento',
                  type: 'analysis',
                  tipo: 'ANÁLISIS',
                  tipoDocumento: 'Análisis Legal',
                  areaLegal: 'civil_comercial',
                  createdAt: result.uploadedAt || new Date().toISOString(),
                  creado: result.uploadedAt ? new Date(result.uploadedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-AR'),
                  estado: 'Análisis no disponible',
                  markdown: '',
                  memoData: {
                    resumen: '⚠️ Este análisis fue eliminado automáticamente por el sistema de limpieza. El documento original puede haber sido borrado para liberar espacio.',
                    puntos_tratados: [],
                    riesgos: [],
                    proximos_pasos: [],
                    citas: [],
                    texto_formateado: '⚠️ Este análisis fue eliminado automáticamente por el sistema de limpieza. El documento original puede haber sido borrado para liberar espacio.'
                  },
                  citations: [],
                  filename: result.filename,
                  deleted: true
                };
                setMemo(deletedMemo);
                return;
              }
              
              // Convertir el resultado de análisis al formato esperado por la UI
              if (result.analysis) {
                let report = result.analysis.report;
                if (typeof report === 'string') {
                  try {
                    report = JSON.parse(report);
                  } catch {
                    report = { texto_formateado: report };
                  }
                }

                const analysisMemo = {
                  id: result.documentId,
                  title: report?.titulo || result.filename || 'Análisis Legal',
                  asunto: report?.titulo || result.filename,
                  type: 'analysis',
                  tipo: 'ANÁLISIS',
                  tipoDocumento: report?.tipo_documento || 'Análisis Legal',
                  areaLegal: report?.area_legal || 'civil_comercial',
                  createdAt: result.uploadedAt || result.analysis.analyzedAt,
                  creado: result.uploadedAt ? new Date(result.uploadedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-AR'),
                  estado: 'Listo para revisión',
                  markdown: report?.texto_formateado || report?.resumen_ejecutivo || '',
                  memoData: {
                    resumen: report?.resumen_ejecutivo || report?.resumen || '',
                    puntos_tratados: report?.clausulas_analizadas || [],
                    riesgos: report?.riesgos || [],
                    proximos_pasos: report?.proximos_pasos || report?.recomendaciones || [],
                    citas: report?.citas || [],
                    texto_formateado: report?.texto_formateado || ''
                  },
                  citations: report?.citas || [],
                  filename: result.filename
                };
                
                setMemo(analysisMemo);
                return;
              }
            } else if (response.status === 404) {
              // Documento no encontrado - puede haber sido borrado
              const deletedMemo = {
                id: memoId,
                title: 'Documento no encontrado',
                asunto: 'Documento no encontrado',
                type: 'analysis',
                tipo: 'ANÁLISIS',
                tipoDocumento: 'Análisis Legal',
                areaLegal: 'civil_comercial',
                createdAt: new Date().toISOString(),
                creado: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                estado: 'Documento eliminado',
                markdown: '',
                memoData: {
                  resumen: '⚠️ Este documento y su análisis fueron eliminados automáticamente por el sistema de limpieza para liberar espacio. Los documentos antiguos se eliminan automáticamente después de cierto tiempo o cuando se excede el límite de documentos.',
                  puntos_tratados: [],
                  riesgos: [],
                  proximos_pasos: [],
                  citas: [],
                  texto_formateado: '⚠️ Este documento y su análisis fueron eliminados automáticamente por el sistema de limpieza para liberar espacio. Los documentos antiguos se eliminan automáticamente después de cierto tiempo o cuando se excede el límite de documentos.'
                },
                citations: [],
                filename: 'Documento eliminado',
                deleted: true
              };
              setMemo(deletedMemo);
              return;
            }
          } catch (apiError) {
            console.warn("Error al cargar desde API:", apiError);
          }
        }

        // 3. Si no se encuentra en ningún lado, redirigir
        router.push("/");
      } catch (e) {
        console.error("Error al cargar memo:", e);
        router.push("/");
      }
    };

    loadMemo();
  }, [memoId, router, API]);

  const formatFecha = (fecha: string) => {
    try {
      const date = new Date(fecha);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('es-AR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch {}
    return fecha || new Date().toLocaleDateString('es-AR');
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (filename: string, content: string) => {
    const sanitize = (s: string) => s.replace(/[^a-z0-9\-\_\ ]/gi, "_");
    
    if (!API) {
      // Fallback: descargar como markdown si no hay API
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitize(filename)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      // Llamar al endpoint para convertir a Word
      const response = await fetch(`${API}/api/convert-to-word`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content,
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
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitize(filename)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      alert("Error al generar Word. Se descargó como Markdown.");
    }
  };

  if (!memo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando reunión...</div>
      </div>
    );
  }

  const memoData = memo.memoData || {};
  const transcriptText = memo.transcriptText || memoData.transcriptText || "";

  return (
    <div className="h-screen bg-[#f4f7fe] flex flex-col overflow-hidden">
      {/* Header con gradiente mejorado */}
      <header className="bg-gradient-to-r from-[hsl(260,100%,70%)] to-[hsl(280,100%,65%)] p-4 sm:p-6 shadow-md flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/")}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-full text-white transition-colors duration-300"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate">{memo.title || memo.asunto}</h1>
            </div>
            <button
              onClick={() => handleDownload(
                memo.title || memo.asunto || "documento",
                memo.markdown || memoData.texto_formateado || ""
              )}
              className="bg-white/20 hover:bg-white/30 px-3 sm:px-4 py-2 rounded-full text-white transition-colors duration-300 flex items-center gap-2 font-medium text-sm sm:text-base"
              title="Descargar documento completo"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Descargar</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 sm:mt-4 text-white/90 text-xs sm:text-sm">
            <span className="bg-white/20 px-2 sm:px-3 py-1 rounded-full">
              {memo.tipoDocumento || (memo.type === 'analysis' || memo.tipo === 'ANÁLISIS' ? "Análisis de Documento" : "Transcripción de Reunión")}
            </span>
            <span className="bg-white/20 px-2 sm:px-3 py-1 rounded-full">{getAreaLegalLabel(memo.areaLegal || memoData.areaLegal || "civil_comercial")}</span>
            <span className="bg-white/20 px-2 sm:px-3 py-1 rounded-full hidden sm:block">{formatFecha(memo.createdAt || new Date().toISOString())}</span>
          </div>
        </div>
      </header>

      {/* Main Content - Layout mejorado con scroll */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-6 sm:space-y-8">
          {/* Primera fila: Documento + Documentos Sugeridos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Columna izquierda - Contenido del Documento */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center gap-3 sm:gap-4 flex-shrink-0">
              <div className="bg-blue-500 p-2 sm:p-3 rounded-lg text-white">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                {memo.type === 'analysis' || memo.tipo === 'ANÁLISIS' ? "Análisis de Documento" : "Transcripción de Reunión"}
              </h2>
            </div>
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {/* Tabs principales */}
              <div className="border-b border-slate-200 mb-4 sm:mb-6">
                <nav className="flex flex-wrap gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3 -mb-px overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("resumen")}
                    className={`flex items-center gap-2 py-3 px-1 border-b-2 font-semibold text-sm transition-colors duration-300 ${
                      activeTab === "resumen"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-blue-500 hover:border-blue-500"
                    }`}
                  >
                    <FileText className="text-base" />
                    Resumen
                  </button>
                  <button
                    onClick={() => setActiveTab("puntos")}
                    className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors duration-300 ${
                      activeTab === "puntos"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-blue-500 hover:border-blue-500"
                    }`}
                  >
                    <ListChecks className="text-base" />
                    Puntos tratados
                  </button>
                  <button
                    onClick={() => setActiveTab("pasos")}
                    className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors duration-300 ${
                      activeTab === "pasos"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-blue-500 hover:border-blue-500"
                    }`}
                  >
                    <TrendingUp className="text-base" />
                    Próximos pasos
                  </button>
                  <button
                    onClick={() => setActiveTab("fuentes")}
                    className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors duration-300 ${
                      activeTab === "fuentes"
                        ? "border-blue-500 text-blue-500"
                        : "border-transparent text-slate-500 hover:text-blue-500 hover:border-blue-500"
                    }`}
                  >
                    <Library className="text-base" />
                    Fuentes
                  </button>
                </nav>
              </div>

              {/* Botones secundarios */}
              <div className="flex flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
                <button
                  onClick={() => setActiveTab("riesgos")}
                  className={`flex items-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-300 ${
                    activeTab === "riesgos"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <AlertTriangle className="text-orange-500 text-base" />
                  Riesgos
                </button>
                <button
                  onClick={() => setActiveTab("citas")}
                  className={`flex items-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-300 ${
                    activeTab === "citas"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <BookOpen className="text-purple-500 text-base" />
                  Citas
                </button>
                <button
                  onClick={() => setActiveTab("texto")}
                  className={`flex items-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-300 ${
                    activeTab === "texto"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Copy className="text-green-500 text-base" />
                  Texto completo
                </button>
              </div>

            {/* Tab Content */}
            <div>
              {activeTab === "resumen" && (
                <div className="bg-blue-50 p-5 rounded-lg">
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {memoData.resumen || (memo.deleted ? "⚠️ Este análisis fue eliminado automáticamente por el sistema de limpieza." : "No hay resumen disponible.")}
                  </p>
                </div>
              )}

              {activeTab === "puntos" && (
                <div>
                  {memoData.puntos_tratados && memoData.puntos_tratados.length > 0 ? (
                    <ul className="space-y-3">
                      {memoData.puntos_tratados.map((punto: string | any, i: number) => {
                        // Manejar tanto strings como objetos (clausulas_analizadas)
                        const puntoText = typeof punto === "string" 
                          ? punto 
                          : `${punto.numero || ""} ${punto.titulo || ""} - ${punto.analisis || ""}`.trim();
                        const riesgo = typeof punto === "object" ? punto.riesgo : null;
                        
                        return (
                          <li key={i} className="flex items-start gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100 hover:shadow-md transition-shadow">
                            <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 shrink-0">
                              <ListChecks className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex-1">
                              <span className="text-slate-800 font-medium block">{puntoText}</span>
                              {riesgo && (
                                <span className={`text-xs px-2 py-1 rounded mt-2 inline-block ${
                                  riesgo === "alto" ? "bg-red-100 text-red-800" :
                                  riesgo === "medio" ? "bg-yellow-100 text-yellow-800" :
                                  "bg-green-100 text-green-800"
                                }`}>
                                  Riesgo: {riesgo}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-sm">No hay puntos tratados registrados.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "pasos" && (
                <div>
                  {memoData.proximos_pasos && memoData.proximos_pasos.length > 0 ? (
                    <>
                      {/* Plan de acción sugerido destacado */}
                      <div className="mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border-2 border-emerald-200 shadow-md">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                            <TrendingUp className="h-5 w-5 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-800">Plan de acción sugerido</h3>
                        </div>
                        <ul className="space-y-3">
                          {memoData.proximos_pasos.map((paso: string | any, i: number) => {
                            // Convertir objeto a string si es necesario
                            const pasoText = typeof paso === "string" 
                              ? paso 
                              : (paso.descripcion || paso.texto || paso.accion || JSON.stringify(paso));
                            
                            return (
                              <li key={i} className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  id={`paso-${i}`}
                                />
                                <label htmlFor={`paso-${i}`} className="text-slate-800 font-medium flex-1 cursor-pointer leading-relaxed">
                                  {pasoText}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      
                      {/* Lista adicional con iconos (opcional, para referencia visual) */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-600 mb-2">Detalle de próximos pasos:</h4>
                        {memoData.proximos_pasos.map((paso: string | any, i: number) => {
                          // Convertir objeto a string si es necesario
                          const pasoText = typeof paso === "string" 
                            ? paso 
                            : (paso.descripcion || paso.texto || paso.accion || JSON.stringify(paso));
                          
                          return (
                            <div key={i} className="flex items-start gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 hover:shadow-md transition-shadow">
                              <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0">
                                <TrendingUp className="h-3 w-3 text-white" />
                              </div>
                              <span className="text-slate-800 font-medium flex-1">{pasoText}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-sm">No hay próximos pasos registrados.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "fuentes" && (
                <div>
                  {(() => {
                    // Combinar todas las fuentes disponibles de ambas ubicaciones
                    const fuentesCitations = memo.citations || [];
                    const fuentesCitas = memoData.citas || [];
                    
                    // Crear un Set para evitar duplicados basado en referencia/título
                    const fuentesUnicas = new Map();
                    
                    // Agregar citas de memo.citations
                    fuentesCitations.forEach((f: any) => {
                      const key = f.title || f.referencia || f.descripcion || "";
                      if (key && !fuentesUnicas.has(key)) {
                        fuentesUnicas.set(key, f);
                      }
                    });
                    
                    // Agregar citas de memoData.citas (pueden tener formato diferente)
                    fuentesCitas.forEach((f: any) => {
                      const key = f.referencia || f.title || f.descripcion || "";
                      if (key && !fuentesUnicas.has(key)) {
                        fuentesUnicas.set(key, f);
                      }
                    });
                    
                    const fuentes = Array.from(fuentesUnicas.values());
                    
                    if (fuentes.length === 0) {
                      return (
                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                          <p className="text-slate-500 text-sm">No hay fuentes jurídicas registradas.</p>
                          <p className="text-slate-400 text-xs mt-2">Las fuentes legales (normativa, jurisprudencia, doctrina) aparecerán aquí cuando se generen memos con referencias legales.</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        {fuentes.map((fuente: any, i: number) => {
                          // Normalizar formato de fuente
                          const titulo = fuente.title || fuente.referencia || fuente.descripcion || "(sin título)";
                          const tipo = fuente.source || fuente.tipo || "otra";
                          const url = fuente.url;
                          const descripcion = fuente.descripcion;
                          
                          return (
                            <div key={i} className="border border-indigo-200 rounded-xl p-4 bg-gradient-to-br from-indigo-50 to-blue-50 hover:shadow-lg transition-all">
                              <div className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                                <Library className="h-4 w-4 text-indigo-600" />
                                {titulo}
                              </div>
                              {descripcion && (
                                <div className="text-slate-700 text-xs mb-3 leading-relaxed">{descripcion}</div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                                  tipo === "normativa" ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md" :
                                  tipo === "jurisprudencia" ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md" :
                                  tipo === "doctrina" ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md" :
                                  "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-md"
                                }`}>
                                  {tipo === "normativa" ? "Normativa" :
                                   tipo === "jurisprudencia" ? "Jurisprudencia" :
                                   tipo === "doctrina" ? "Doctrina" :
                                   tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                                </span>
                                {url && (
                                  <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium underline flex items-center gap-1">
                                    Ver fuente
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === "riesgos" && (
                <div>
                  {memoData.riesgos && memoData.riesgos.length > 0 ? (
                    <ul className="space-y-3">
                      {memoData.riesgos.map((riesgo: string | any, i: number) => {
                        // Manejar tanto strings como objetos con { descripcion, nivel, recomendacion }
                        let riesgoText: string;
                        if (typeof riesgo === "string") {
                          riesgoText = riesgo;
                        } else if (typeof riesgo === "object" && riesgo !== null) {
                          // Intentar extraer texto de campos comunes
                          riesgoText = riesgo.descripcion || riesgo.texto || riesgo.riesgo || riesgo.nombre || "";
                          // Si no hay texto, convertir a string seguro
                          if (!riesgoText) {
                            riesgoText = JSON.stringify(riesgo);
                          }
                        } else {
                          riesgoText = String(riesgo || "");
                        }
                        
                        const nivel = typeof riesgo === "object" && riesgo !== null && riesgo.nivel 
                          ? riesgo.nivel 
                          : "medio";
                        const recomendacion = typeof riesgo === "object" && riesgo !== null ? riesgo.recomendacion : null;
                        
                        return (
                          <li key={i} className={`flex items-start gap-3 rounded-xl p-4 border hover:shadow-md transition-shadow ${
                            nivel === "alto" ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-100" :
                            nivel === "medio" ? "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100" :
                            "bg-gradient-to-r from-green-50 to-emerald-50 border-green-100"
                          }`}>
                            <div className={`mt-0.5 p-1.5 rounded-full shrink-0 ${
                              nivel === "alto" ? "bg-gradient-to-br from-red-500 to-orange-600" :
                              nivel === "medio" ? "bg-gradient-to-br from-amber-500 to-orange-600" :
                              "bg-gradient-to-br from-green-500 to-emerald-600"
                            }`}>
                              <AlertTriangle className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-slate-800 font-medium">{riesgoText}</span>
                                {typeof riesgo === "object" && riesgo !== null && riesgo.nivel && (
                                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                                    nivel === "alto" ? "bg-red-200 text-red-800" :
                                    nivel === "medio" ? "bg-yellow-200 text-yellow-800" :
                                    "bg-green-200 text-green-800"
                                  }`}>
                                    {nivel.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {recomendacion && (
                                <p className="text-sm text-slate-600 mt-2">💡 {recomendacion}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-sm">No hay riesgos identificados.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "citas" && (
                <div>
                  {memo.citations && memo.citations.length > 0 ? (
                    <div className="space-y-3">
                      {memo.citations.map((cita: any, i: number) => (
                        <div key={i} className="border border-purple-200 rounded-xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 hover:shadow-lg transition-all">
                          <div className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-purple-600" />
                            {cita.title || "(sin título)"}
                          </div>
                          {cita.descripcion && (
                            <div className="text-slate-700 text-xs mb-3 leading-relaxed">{cita.descripcion}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                              cita.source === "normativa" ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md" :
                              cita.source === "jurisprudencia" ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md" :
                              "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-md"
                            }`}>
                              {cita.source || "Otra"}
                            </span>
                            {cita.url && (
                              <a href={cita.url} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:text-purple-700 font-medium underline flex items-center gap-1">
                                Ver fuente
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-sm">No hay citas registradas.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "texto" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Texto completo de la reunión</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopyText(memo.markdown || memoData.texto_formateado || "")}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copiar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDownload(
                          memo.title || memo.asunto || "documento",
                          memo.markdown || memoData.texto_formateado || ""
                        )}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        <Download className="h-3 w-3" />
                        Descargar
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 max-h-[400px] sm:max-h-[600px] overflow-auto">
                    <pre className="text-xs sm:text-sm font-mono text-slate-700 whitespace-pre-wrap">
                      {memo.markdown || memoData.texto_formateado || "No hay texto disponible."}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>

          {/* Columna derecha - Documentos Sugeridos */}
          <div className="lg:col-span-1">
            <MemoSuggestedDocuments
              memoId={memoId}
              memoData={memoData}
              apiUrl={API}
            />
          </div>
        </div>

        {/* Segunda fila: Chat debajo del documento */}
        <div className="bg-white rounded-lg shadow-lg flex flex-col min-h-[400px] max-h-[600px]">
          <MemoChatPanel 
            transcriptText={transcriptText}
            areaLegal={memo.areaLegal || memoData.areaLegal || "civil_comercial"}
            memoTitle={memo.title || memo.asunto}
            memoText={memo.markdown || memoData.texto_formateado || ""}
            citas={memo.citations || memoData.citas || []}
            isAnalysis={memo.type === 'analysis' || memo.tipo === 'ANÁLISIS'}
            documentId={memo.id}
          />
        </div>
      </div>
      </main>

      {/* Estilos auxiliares */}
      <style jsx global>{`
        .icon-btn { @apply rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 text-slate-600 transition-colors; }
      `}</style>
    </div>
  );
}

function MemoChatPanel({ 
  transcriptText, 
  areaLegal, 
  memoTitle,
  memoText,
  citas,
  isAnalysis = false,
  documentId
}: { 
  transcriptText: string; 
  areaLegal: string; 
  memoTitle: string;
  memoText: string;
  citas: Array<any>;
  isAnalysis?: boolean;
  documentId?: string;
}) {
  const [messages, setMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const API = useMemo(() => getApiUrl(), []);

  async function handleSendMessage() {
    if (!currentMessage.trim() || !API) return;

    const userMessage = { role: "user" as const, content: currentMessage };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setCurrentMessage("");
    setLoading(true);

    try {
      // Normalizar citas al formato esperado por el backend
      const citasNormalizadas = citas.map((c: any) => ({
        tipo: c.tipo || c.source || "otra",
        referencia: c.referencia || c.title || "(sin referencia)",
        descripcion: c.descripcion,
        url: c.url
      }));

      const r = await fetch(`${API}/api/memos/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: transcriptText || "",
          messages: newMessages,
          areaLegal: areaLegal,
          memoText: memoText || "",
          citas: citasNormalizadas
        })
      });

      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`Error ${r.status}: ${errorText || "Error desconocido"}`);
      }

      const data = await r.json();
      const assistantMessage = { role: "assistant" as const, content: data.message || data.response || "No se pudo generar una respuesta." };
      setMessages([...newMessages, assistantMessage]);
    } catch (e: any) {
      const errorMessage = { role: "assistant" as const, content: `Error: ${e.message || "Error al procesar la consulta"}` };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  // Función para generar documento actualizado con recomendaciones del chat
  const generateUpdatedDocument = (originalText: string, chatMessages: Array<{role: "user" | "assistant"; content: string}>): string => {
    if (chatMessages.length === 0) {
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
    if (!API || downloading) return;
    
    setDownloading(true);
    try {
      // Generar documento actualizado
      const documentoActualizado = generateUpdatedDocument(memoText, messages);
      
      // Descargar en Word
      const sanitize = (s: string) => s.replace(/[^a-z0-9\-\_\ ]/gi, "_");
      const filename = `${memoTitle}_actualizado_${new Date().toISOString().split("T")[0]}`;
      
      const response = await fetch(`${API}/api/convert-to-word`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: documentoActualizado,
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
      console.error("Error al descargar documento actualizado:", error);
      alert("Error al generar Word. Intenta de nuevo.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header del chat con gradiente */}
      <div className="p-4 sm:p-6 bg-gradient-to-r from-pink-50 to-fuchsia-50 flex items-center justify-between gap-3 sm:gap-4 flex-shrink-0 border-b border-pink-200">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-pink-500 p-2 sm:p-3 rounded-lg text-white">
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">
            {isAnalysis ? "Chat sobre este análisis de documento" : "Chat sobre esta transcripción de reunión"}
          </h2>
        </div>
        {/* Botón Descargar Word con recomendaciones del chat - Siempre visible */}
        <button
          onClick={handleDownloadWithChat}
          disabled={downloading || messages.length === 0}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          title={messages.length === 0 ? "Envía un mensaje en el chat para habilitar la descarga" : "Descargar documento actualizado con recomendaciones del chat en Word (.docx)"}
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
      </div>
      {messages.length > 0 && (
          <>
            {/* Resumen de puntos clave que se aplicarán */}
            <div className="px-4 sm:px-6 pb-3">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Sparkles className="h-3 w-3" />
                  Puntos clave del chat que se aplicarán al nuevo {isAnalysis ? "análisis de documento" : "transcripción de reunión"}:
                </p>
                <div className="space-y-1.5">
                  {extractKeyPointsFromChat(messages).map((point, idx) => (
                    <div key={idx} className="text-xs text-purple-800 bg-white/60 rounded px-2 py-1">
                      {point}
                    </div>
                  ))}
                  {extractKeyPointsFromChat(messages).length === 0 && (
                    <p className="text-xs text-purple-600 italic">Extrayendo puntos clave del chat...</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-4 sm:px-6 pb-4">
              <button
                onClick={() => setShowRegenerateModal(true)}
                disabled={regenerating}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                title={`Regenerar ${isAnalysis ? "análisis de documento" : "transcripción de reunión"} con los criterios del chat`}
              >
                {regenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Regenerando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Regenerar {isAnalysis ? "análisis" : "transcripción"}</span>
                  </>
                )}
              </button>
            </div>
            
            {/* Modal de confirmación */}
            {showRegenerateModal && (() => {
              const chatContext = extractChatContext(messages);
              return (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                    <h3 className="text-xl font-bold text-gray-900">Regenerar {isAnalysis ? "análisis de documento" : "transcripción de reunión"} con contexto del chat</h3>
                    
                    {/* Mostrar TODOS los mensajes del chat */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                      <p className="text-sm font-semibold text-gray-900 mb-3">Historial completo del chat:</p>
                      <div className="space-y-3">
                        {messages.map((msg, idx) => (
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
                        <p className="text-sm font-semibold text-purple-900 mb-2">📋 Contexto que se aplicará al {isAnalysis ? "análisis" : "documento"}:</p>
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
                        {isAnalysis 
                          ? "El análisis de documento se regenerará completamente (OCR, traducción, clasificación, análisis de cláusulas, riesgos, fuentes y texto completo) incorporando TODAS las instrucciones y conclusiones del chat mostradas arriba."
                          : "La transcripción de reunión se regenerará completamente incorporando TODAS las instrucciones y conclusiones del chat mostradas arriba."}
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
                        onClick={async () => {
                          setShowRegenerateModal(false);
                          if (!API || regenerating) return;
                          setRegenerating(true);
                          try {
                            const chatContext = extractChatContext(messages);
                            console.log("[REGENERATE-DETAIL] Chat messages:", messages);
                            console.log("[REGENERATE-DETAIL] Extracted context:", chatContext);
                            
                            if (isAnalysis && documentId) {
                              // Regenerar análisis de documento
                              const enhancedInstructions = chatContext 
                                ? `CONTEXTO Y CONCLUSIONES DEL CHAT (APLICAR EN TODO EL ANÁLISIS):\n${chatContext}`
                                : "";
                              
                              console.log("[REGENERATE-DETAIL] Enhanced instructions:", enhancedInstructions);
                              
                              const analyzeResponse = await fetch(`${API}/legal/analyze/${documentId}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(enhancedInstructions ? { instructions: enhancedInstructions.slice(0, 2000) } : {}),
                              });
                              
                              if (!analyzeResponse.ok) {
                                throw new Error(`Error ${analyzeResponse.status}: ${await analyzeResponse.text()}`);
                              }
                              
                              // Esperar un poco y recargar
                              setTimeout(() => {
                                window.location.reload();
                              }, 2000);
                            } else {
                              // Regenerar memo/reunión
                              const enhancedInstructions = chatContext 
                                ? `CONTEXTO Y CONCLUSIONES DEL CHAT (APLICAR EN TODO EL DOCUMENTO):\n${chatContext}`
                                : "";
                              
                              const formData = new FormData();
                              formData.append("tipoDocumento", isAnalysis ? "Análisis de Documento" : "Transcripción de Reunión");
                              formData.append("titulo", memoTitle);
                              formData.append("instrucciones", enhancedInstructions);
                              formData.append("areaLegal", areaLegal);
                              if (transcriptText.trim()) {
                                formData.append("transcriptText", transcriptText);
                              }
                              
                              const r = await fetch(`${API}/api/memos/generate`, {
                                method: "POST",
                                body: formData
                              });
                              
                              if (!r.ok) {
                                throw new Error(`Error ${r.status}: ${await r.text()}`);
                              }
                              
                              const data = await r.json();
                              // Recargar la página para mostrar el nuevo resultado
                              window.location.reload();
                            }
                          } catch (err: any) {
                            console.error("Error al regenerar:", err);
                            alert(`Error al regenerar: ${err.message || "Intenta de nuevo"}`);
                          } finally {
                            setRegenerating(false);
                          }
                        }}
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
      </div>

      {/* Messages con diseño moderno */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6 text-center min-h-0 overflow-y-auto">
          <div className="bg-purple-100 p-4 sm:p-6 rounded-full mb-3 sm:mb-4">
            <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 text-purple-500" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">Iniciá una conversación sobre esta reunión</h3>
          <p className="text-slate-500 mt-1 text-xs sm:text-sm max-w-xs mx-auto">
            Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 p-4 sm:p-6 min-h-0">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-xs font-bold mr-2 shrink-0 shadow-md">
                  IA
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl p-4 shadow-lg ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-sm"
                    : "bg-gradient-to-br from-slate-50 to-purple-50/50 text-slate-900 border border-purple-100 rounded-tl-sm"
                }`}
              >
                <div className={`text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user" ? "text-white" : "text-slate-800"
                }`}>
                  {msg.content}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ml-2 shrink-0 shadow-md">
                  Tú
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-xs font-bold mr-2 shrink-0 shadow-md">
                IA
              </div>
              <div className="bg-gradient-to-br from-slate-50 to-purple-50/50 rounded-2xl rounded-tl-sm p-4 border border-purple-100 shadow-lg">
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="font-medium">Pensando...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sugerencias de consulta */}
      {messages.length === 0 && (
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2 border-t border-slate-200 flex-shrink-0">
          <p className="text-xs text-slate-500 mb-2 sm:mb-3 font-medium">Sugerencias de consulta:</p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {[
              "Resumí los riesgos clave",
              "Armá un plan de acción por responsable",
              "Generá un mail al cliente con las conclusiones",
              "Indicá qué documentación adicional deberíamos pedir"
            ].map((sugerencia, idx) => (
              <button
                key={idx}
                onClick={async () => {
                  if (!API || loading) return;
                  const userMessage = { role: "user" as const, content: sugerencia };
                  const newMessages = [userMessage];
                  setMessages(newMessages);
                  setLoading(true);

                  try {
                    // Normalizar citas al formato esperado por el backend
                    const citasNormalizadas = citas.map((c: any) => ({
                      tipo: c.tipo || c.source || "otra",
                      referencia: c.referencia || c.title || "(sin referencia)",
                      descripcion: c.descripcion,
                      url: c.url
                    }));

                    const r = await fetch(`${API}/api/memos/chat`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        transcriptText: transcriptText || "",
                        messages: newMessages,
                        areaLegal: areaLegal,
                        memoText: memoText || "",
                        citas: citasNormalizadas
                      })
                    });

                    if (!r.ok) {
                      const errorText = await r.text();
                      throw new Error(`Error ${r.status}: ${errorText || "Error desconocido"}`);
                    }

                    const data = await r.json();
                    const assistantMessage = { role: "assistant" as const, content: data.message || data.response || "No se pudo generar una respuesta." };
                    setMessages([...newMessages, assistantMessage]);
                  } catch (e: any) {
                    const errorMessage = { role: "assistant" as const, content: `Error: ${e.message || "Error al procesar la consulta"}` };
                    setMessages([...newMessages, errorMessage]);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="text-xs px-3 py-1.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-purple-700 rounded-full hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sugerencia}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input mejorado */}
      <div className="p-4 sm:p-6 border-t border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <textarea
            className="flex-grow bg-slate-100 border-transparent focus:border-[hsl(260,100%,70%)] focus:ring-[hsl(260,100%,70%)] rounded-lg text-slate-700 placeholder-slate-400 transition resize-none text-sm sm:text-base py-2 px-3"
            placeholder="Preguntá sobre la reunión..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            rows={1}
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !currentMessage.trim()}
            className="bg-gradient-to-br from-[hsl(260,100%,70%)] to-pink-500 hover:shadow-lg hover:shadow-[hsl(260,100%,70%)]/30 text-white font-bold py-2 sm:py-3 px-3 sm:px-5 rounded-lg flex items-center gap-1 sm:gap-2 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm sm:text-base"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

