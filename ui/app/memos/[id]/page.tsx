"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, MessageSquare, FileText, AlertTriangle, ListChecks, TrendingUp, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

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
  const [activeTab, setActiveTab] = useState<"resumen" | "puntos" | "pasos" | "riesgos" | "citas" | "texto">("resumen");
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header con gradiente */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 border-b border-blue-700/20 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 p-2 hover:bg-white/30 text-white transition-all hover:scale-105"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white drop-shadow-sm">{memo.title || memo.asunto}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-white/90">
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-xs font-medium">
                  {memo.tipoDocumento || "Memo / Dictamen de reunión"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-xs font-medium">
                  {getAreaLegalLabel(memo.areaLegal || memoData.areaLegal || "civil_comercial")}
                </span>
                <span className="text-white/70">{formatFecha(memo.createdAt || new Date().toISOString())}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Memo Content */}
          <div className="bg-white rounded-2xl border border-slate-200/50 shadow-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gradient-to-r from-blue-200 to-purple-200 bg-gradient-to-r from-blue-50/50 to-purple-50/50 -mx-6 px-6 rounded-t-2xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Contenido del Memo
              </h2>
            </div>

            {/* Tabs con más color */}
            <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-slate-200/50">
              {[
                { id: "resumen", label: "Resumen", icon: FileText, color: "blue" },
                { id: "puntos", label: "Puntos tratados", icon: ListChecks, color: "indigo" },
                { id: "pasos", label: "Próximos pasos", icon: TrendingUp, color: "emerald" },
                { id: "riesgos", label: "Riesgos", icon: AlertTriangle, color: "amber" },
                { id: "citas", label: "Citas", icon: BookOpen, color: "purple" },
                { id: "texto", label: "Texto completo", icon: Copy, color: "slate" }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const colorClasses = {
                  blue: isActive ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-blue-600 hover:bg-blue-50",
                  indigo: isActive ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-indigo-600 hover:bg-indigo-50",
                  emerald: isActive ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30" : "text-emerald-600 hover:bg-emerald-50",
                  amber: isActive ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/30" : "text-amber-600 hover:bg-amber-50",
                  purple: isActive ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30" : "text-purple-600 hover:bg-purple-50",
                  slate: isActive ? "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg shadow-slate-500/30" : "text-slate-600 hover:bg-slate-50"
                };
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 ${
                      colorClasses[tab.color as keyof typeof colorClasses]
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="mt-4">
              {activeTab === "resumen" && (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-5 border border-blue-100">
                    <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{memoData.resumen || "No hay resumen disponible."}</p>
                  </div>
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
                    <ul className="space-y-3">
                      {memoData.proximos_pasos.map((paso: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 hover:shadow-md transition-shadow">
                          <div className="mt-0.5 p-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0">
                            <TrendingUp className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-slate-800 font-medium flex-1">{paso}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-sm">No hay próximos pasos registrados.</p>
                    </div>
                  )}
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

          {/* Right Column - Chat */}
          <div className="bg-white rounded-2xl border border-slate-200/50 shadow-xl p-6 backdrop-blur-sm">
            <MemoChatPanel 
              transcriptText={transcriptText}
              areaLegal={memo.areaLegal || memoData.areaLegal || "civil_comercial"}
              memoTitle={memo.title || memo.asunto}
            />
          </div>
        </div>
      </div>

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
  memoTitle 
}: { 
  transcriptText: string; 
  areaLegal: string; 
  memoTitle: string;
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
      const r = await fetch(`${API}/api/memos/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: transcriptText || "",
          messages: newMessages,
          areaLegal: areaLegal
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
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gradient-to-r from-purple-200 to-pink-200 bg-gradient-to-r from-purple-50/50 to-pink-50/50 -mx-6 px-6 rounded-t-2xl">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg">
          <MessageSquare className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          Chat sobre esta reunión
        </h2>
      </div>

      {/* Messages con diseño moderno */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[400px] max-h-[600px] px-1">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 mb-4">
              <MessageSquare className="h-8 w-8 text-purple-600" />
            </div>
            <p className="text-slate-700 font-medium mb-1">Iniciá una conversación sobre este memo</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
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
          ))
        )}
        {loading && (
          <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
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

      {/* Input mejorado */}
      <div className="border-t border-slate-200/50 pt-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              className="w-full rounded-xl border-2 border-slate-200 bg-white text-slate-900 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 placeholder:text-slate-400 resize-none transition-all shadow-sm hover:shadow-md"
              placeholder="Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente…"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={3}
              disabled={loading}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={loading || !currentMessage.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 text-white px-6 py-3 font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            <MessageSquare className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

