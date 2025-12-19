"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, MessageSquare, FileText, AlertTriangle, ListChecks, TrendingUp, BookOpen, Send, Library } from "lucide-react";
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

  // Cargar memo desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("legal-memos");
      if (saved) {
        const memos = JSON.parse(saved);
        const found = memos.find((m: any) => m.id === memoId);
        if (found) {
          setMemo(found);
        } else {
          // Si no se encuentra, redirigir a la página principal
          router.push("/");
        }
      } else {
        router.push("/");
      }
    } catch (e) {
      console.error("Error al cargar memo:", e);
      router.push("/");
    }
  }, [memoId, router]);

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

  if (!memo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando memo...</div>
      </div>
    );
  }

  const memoData = memo.memoData || {};
  const transcriptText = memo.transcriptText || memoData.transcriptText || "";

  return (
    <div className="min-h-screen bg-[#f4f7fe]">
      {/* Header con gradiente mejorado */}
      <header className="bg-gradient-to-r from-[hsl(260,100%,70%)] to-[hsl(280,100%,65%)] p-6 shadow-md">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/")}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-full text-white transition-colors duration-300"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-3xl font-bold text-white">{memo.title || memo.asunto}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 text-white/90 text-sm">
            <span className="bg-white/20 px-3 py-1 rounded-full">{memo.tipoDocumento || "Memo / Dictamen de reunión"}</span>
            <span className="bg-white/20 px-3 py-1 rounded-full">{getAreaLegalLabel(memo.areaLegal || memoData.areaLegal || "civil_comercial")}</span>
            <span className="bg-white/20 px-3 py-1 rounded-full hidden sm:block">{formatFecha(memo.createdAt || new Date().toISOString())}</span>
          </div>
        </div>
      </header>

      {/* Main Content - Three Columns */}
      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Memo Content */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center gap-4">
              <div className="bg-blue-500 p-3 rounded-lg text-white">
                <FileText className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Contenido del Memo</h2>
            </div>
            <div className="p-6">
              {/* Tabs principales */}
              <div className="border-b border-slate-200 mb-6">
                <nav className="flex flex-wrap gap-x-6 gap-y-3 -mb-px">
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
              <div className="flex flex-wrap gap-4 mb-6">
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
                    {memoData.resumen || "No hay resumen disponible."}
                  </p>
                </div>
              )}

              {activeTab === "puntos" && (
                <div>
                  {memoData.puntos_tratados && memoData.puntos_tratados.length > 0 ? (
                    <ul className="space-y-3">
                      {memoData.puntos_tratados.map((punto: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100 hover:shadow-md transition-shadow">
                          <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 shrink-0">
                            <ListChecks className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-slate-800 font-medium flex-1">{punto}</span>
                        </li>
                      ))}
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
                          {memoData.proximos_pasos.map((paso: string, i: number) => (
                            <li key={i} className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                id={`paso-${i}`}
                              />
                              <label htmlFor={`paso-${i}`} className="text-slate-800 font-medium flex-1 cursor-pointer leading-relaxed">
                                {paso}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      {/* Lista adicional con iconos (opcional, para referencia visual) */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-600 mb-2">Detalle de próximos pasos:</h4>
                        {memoData.proximos_pasos.map((paso: string, i: number) => (
                          <div key={i} className="flex items-start gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 hover:shadow-md transition-shadow">
                            <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0">
                              <TrendingUp className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-slate-800 font-medium flex-1">{paso}</span>
                          </div>
                        ))}
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
                      {memoData.riesgos.map((riesgo: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100 hover:shadow-md transition-shadow">
                          <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 shrink-0">
                            <AlertTriangle className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-slate-800 font-medium flex-1">{riesgo}</span>
                        </li>
                      ))}
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
                    <span className="text-sm font-medium text-slate-700">Texto completo del memo</span>
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
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 max-h-[600px] overflow-auto">
                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">
                      {memo.markdown || memoData.texto_formateado || "No hay texto disponible."}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>

          {/* Right Column - Documentos Sugeridos + Chat */}
          <div className="grid grid-rows-2 gap-8">
            {/* Documentos Sugeridos */}
            <MemoSuggestedDocuments
              memoId={memoId}
              memoData={memoData}
              apiUrl={API}
            />
            
            {/* Chat */}
            <div className="bg-white rounded-lg shadow-lg flex flex-col">
              <MemoChatPanel 
                transcriptText={transcriptText}
                areaLegal={memo.areaLegal || memoData.areaLegal || "civil_comercial"}
                memoTitle={memo.title || memo.asunto}
                memoText={memo.markdown || memoData.texto_formateado || ""}
                citas={memo.citations || memoData.citas || []}
              />
            </div>
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
  citas
}: { 
  transcriptText: string; 
  areaLegal: string; 
  memoTitle: string;
  memoText: string;
  citas: Array<any>;
}) {
  const [messages, setMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header del chat con gradiente */}
      <div className="p-6 bg-gradient-to-r from-pink-50 to-fuchsia-50 flex items-center gap-4">
        <div className="bg-pink-500 p-3 rounded-lg text-white">
          <MessageSquare className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Chat sobre esta reunión</h2>
      </div>

      {/* Messages con diseño moderno */}
      {messages.length === 0 ? (
        <div className="flex-grow flex flex-col justify-center items-center p-6 text-center">
          <div className="bg-purple-100 p-6 rounded-full mb-4">
            <MessageSquare className="h-12 w-12 text-purple-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Iniciá una conversación sobre este memo</h3>
          <p className="text-slate-500 mt-1 text-sm max-w-xs mx-auto">
            Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 p-6">
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
        <div className="px-6 pt-4 pb-2 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-3 font-medium">Sugerencias de consulta:</p>
          <div className="flex flex-wrap gap-2">
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
      <div className="p-6 border-t border-slate-200 mt-auto">
        <div className="flex items-center gap-4">
          <textarea
            className="flex-grow bg-slate-100 border-transparent focus:border-[hsl(260,100%,70%)] focus:ring-[hsl(260,100%,70%)] rounded-lg text-slate-700 placeholder-slate-400 transition resize-none"
            placeholder="Preguntá qué hacer..."
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
            className="bg-gradient-to-br from-[hsl(260,100%,70%)] to-pink-500 hover:shadow-lg hover:shadow-[hsl(260,100%,70%)]/30 text-white font-bold py-3 px-5 rounded-lg flex items-center gap-2 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            <Send className="h-5 w-5" />
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

