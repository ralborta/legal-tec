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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => router.push("/")}
              className="icon-btn"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">{memo.title || memo.asunto}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                <span>{memo.tipoDocumento || "Memo / Dictamen de reunión"}</span>
                <span>·</span>
                <span>{getAreaLegalLabel(memo.areaLegal || memoData.areaLegal || "civil_comercial")}</span>
                <span>·</span>
                <span>{formatFecha(memo.createdAt || new Date().toISOString())}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Memo Content */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
              <FileText className="h-5 w-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">Contenido del Memo</h2>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200">
              {[
                { id: "resumen", label: "Resumen", icon: FileText },
                { id: "puntos", label: "Puntos tratados", icon: ListChecks },
                { id: "pasos", label: "Próximos pasos", icon: TrendingUp },
                { id: "riesgos", label: "Riesgos", icon: AlertTriangle },
                { id: "citas", label: "Citas", icon: BookOpen },
                { id: "texto", label: "Texto completo", icon: Copy }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "text-slate-600 hover:bg-slate-50"
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
                  <p className="text-slate-700 whitespace-pre-wrap">{memoData.resumen || "No hay resumen disponible."}</p>
                </div>
              )}

              {activeTab === "puntos" && (
                <div>
                  {memoData.puntos_tratados && memoData.puntos_tratados.length > 0 ? (
                    <ul className="space-y-2">
                      {memoData.puntos_tratados.map((punto: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-slate-700">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span>{punto}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm">No hay puntos tratados registrados.</p>
                  )}
                </div>
              )}

              {activeTab === "pasos" && (
                <div>
                  {memoData.proximos_pasos && memoData.proximos_pasos.length > 0 ? (
                    <ul className="space-y-2">
                      {memoData.proximos_pasos.map((paso: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-slate-700">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>{paso}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm">No hay próximos pasos registrados.</p>
                  )}
                </div>
              )}

              {activeTab === "riesgos" && (
                <div>
                  {memoData.riesgos && memoData.riesgos.length > 0 ? (
                    <ul className="space-y-2">
                      {memoData.riesgos.map((riesgo: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-slate-700">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{riesgo}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm">No hay riesgos identificados.</p>
                  )}
                </div>
              )}

              {activeTab === "citas" && (
                <div>
                  {memo.citations && memo.citations.length > 0 ? (
                    <div className="space-y-3">
                      {memo.citations.map((cita: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                          <div className="font-semibold text-slate-900 text-sm mb-1">{cita.title || "(sin título)"}</div>
                          {cita.descripcion && (
                            <div className="text-slate-600 text-xs mb-2">{cita.descripcion}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              cita.source === "normativa" ? "bg-blue-100 text-blue-700" :
                              cita.source === "jurisprudencia" ? "bg-purple-100 text-purple-700" :
                              "bg-slate-100 text-slate-700"
                            }`}>
                              {cita.source || "Otra"}
                            </span>
                            {cita.url && (
                              <a href={cita.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline">
                                Ver fuente
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">No hay citas registradas.</p>
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
      <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
        <MessageSquare className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-900">Chat sobre esta reunión</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[400px] max-h-[600px]">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p>Iniciá una conversación sobre este memo.</p>
            <p className="text-xs mt-1">Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Pensando...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex gap-2">
          <textarea
            className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400 resize-none"
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
          <button
            onClick={handleSendMessage}
            disabled={loading || !currentMessage.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageSquare className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

