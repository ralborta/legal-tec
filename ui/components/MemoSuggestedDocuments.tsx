"use client";
import React from "react";
import { FileText, Gavel, Edit, File, ChevronRight, X, Download, Loader2, Sparkles, Check } from "lucide-react";

type SuggestedDocument = {
  id: string;
  nombre: string;
  descripcion?: string;
  tipoDocumento?: string;
  tipo?: string;
};

interface Props {
  memoId: string;
  memoData: {
    areaLegal?: string;
    tipo_documento?: string;
    resumen?: string;
    puntos_tratados?: string[] | any[];
    analisis_juridico?: string;
    proximos_pasos?: string[] | any[];
    riesgos?: string[] | any[];
    texto_formateado?: string;
    citas?: any[];
  };
  apiUrl: string;
}

export const MemoSuggestedDocuments: React.FC<Props> = ({ memoId, memoData, apiUrl }) => {
  const [suggestedDocs, setSuggestedDocs] = React.useState<SuggestedDocument[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = React.useState<string>("");
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [showPreviewModal, setShowPreviewModal] = React.useState(false);
  const [generatingDoc, setGeneratingDoc] = React.useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = React.useState<{
    tipo: string;
    contenido: string;
    datosExtraidos?: any;
    placeholdersCount?: number;
    tienePlaceholders?: boolean;
  } | null>(null);
  const [editingPlaceholder, setEditingPlaceholder] = React.useState<{ index: number; value: string } | null>(null);
  const [editedContent, setEditedContent] = React.useState<string>("");
  const [saved, setSaved] = React.useState(false);

  // Cargar sugerencias cuando se monta el componente
  React.useEffect(() => {
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const baseUrl = apiUrl || "";
        const url = `${baseUrl}/api/templates/suggest`;
        console.log(`[TEMPLATE SUGGEST] Llamando a: ${url}`);
        console.log(`[TEMPLATE SUGGEST] apiUrl: ${apiUrl}`);
        
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            areaLegal: memoData.areaLegal || "civil_comercial",
            tipoDocumento: memoData.tipo_documento || "dictamen",
            resumen: memoData.resumen || "",
            puntos_tratados: memoData.puntos_tratados || [],
            analisis_juridico: memoData.analisis_juridico || "",
          }),
        });

        if (!res.ok) {
          throw new Error(`Error ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        setSuggestedDocs(data.sugeridos || []);
      } catch (error) {
        console.error("Error al obtener sugerencias:", error);
        // No mostrar error al usuario, simplemente no mostrar sugerencias
        setSuggestedDocs([]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [memoId, memoData, apiUrl]);

  // Función para generar documento sugerido con datos del análisis
  const handleGenerateSuggestedDoc = async (doc: SuggestedDocument) => {
    setGeneratingDoc(doc.id);
    setGeneratedDoc(null);
    setEditingPlaceholder(null);
    setEditedContent("");

    try {
      const response = await fetch(`${apiUrl}/api/generate-suggested-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoDocumento: doc.nombre || doc.tipo || "",
          descripcion: doc.descripcion || "",
          contextoAnalisis: memoData.texto_formateado || memoData.resumen || "",
          tipoDocumentoAnalizado: memoData.tipo_documento || "",
          jurisdiccion: "Nacional",
          areaLegal: memoData.areaLegal || "civil_comercial",
          citas: memoData.citas || [],
          reportData: memoData
        })
      });

      if (!response.ok) {
        throw new Error("Error al generar documento");
      }

      const data = await response.json();
      const docTipo = doc.nombre || doc.tipo || "";
      setGeneratedDoc({ 
        tipo: docTipo,
        contenido: data.documento || data.contenido || "Sin contenido",
        datosExtraidos: data.datosExtraidos,
        placeholdersCount: data.placeholdersCount || 0,
        tienePlaceholders: data.tienePlaceholders || false
      });
      setEditedContent(data.documento || data.contenido || "");
      setPreviewTitle(docTipo);
      setShowPreviewModal(true);
    } catch (err) {
      console.error("Error generando documento:", err);
      alert("Error al generar el documento. Intenta de nuevo.");
    } finally {
      setGeneratingDoc(null);
    }
  };

  // Función para reemplazar un placeholder específico
  const handleReplacePlaceholder = (index: number, newValue: string) => {
    if (!editedContent) return;
    
    const parts = editedContent.split('XXXXXX');
    if (index < parts.length - 1) {
      const newParts = [...parts];
      newParts[index] = newParts[index] + newValue;
      
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
      
      if (generatedDoc) {
        setGeneratedDoc({ ...generatedDoc, contenido: newContent });
      }
    }
  };

  // Función para reemplazar todos los placeholders
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
      const saved = localStorage.getItem("legal-memos");
      const existingDocs = saved ? JSON.parse(saved) : [];

      const docToSave = {
        id: `doc-${Date.now()}`,
        type: "documento_sugerido",
        title: generatedDoc.tipo,
        asunto: generatedDoc.tipo,
        tipo: "DOCUMENTO SUGERIDO",
        tipoDocumento: generatedDoc.tipo,
        areaLegal: memoData.areaLegal || "civil_comercial",
        createdAt: new Date().toISOString(),
        creado: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        estado: generatedDoc.tienePlaceholders ? "Pendiente de completar" : "Listo para revisión",
        markdown: editedContent,
        memoData: {
          resumen: `Documento sugerido generado a partir del análisis`,
          texto_formateado: editedContent,
          datosExtraidos: generatedDoc.datosExtraidos || {},
          tienePlaceholders: generatedDoc.tienePlaceholders || false,
          placeholdersCount: generatedDoc.placeholdersCount || 0
        },
        citations: memoData.citas || [],
        relacionadoConAnalisis: memoId
      };

      const newDocs = [docToSave, ...existingDocs];
      localStorage.setItem("legal-memos", JSON.stringify(newDocs));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error al guardar documento:", error);
      alert("Error al guardar el documento. Intenta de nuevo.");
    }
  };

  // Renderizar contenido con placeholders resaltados
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

  const handleOpenTemplate = async (id: string, nombre: string) => {
    setLoadingPreview(true);
    setPreviewHtml(null);
    setPreviewTitle(nombre);
    setPreviewId(id);
    setShowPreviewModal(true);

    try {
      // Construir URL correctamente
      const baseUrl = apiUrl || "";
      const url = `${baseUrl}/api/templates/${encodeURIComponent(id)}/preview`;
      console.log(`[TEMPLATE PREVIEW] Llamando a: ${url}`);
      console.log(`[TEMPLATE PREVIEW] apiUrl: ${apiUrl}`);
      console.log(`[TEMPLATE PREVIEW] id: ${id}`);
      
      // Enviar datos del memo para que la IA rellene el template antes del preview
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memoData: {
            titulo: memoData.resumen || "",
            tipo_documento: memoData.tipo_documento || "",
            resumen: memoData.resumen || "",
            puntos_tratados: memoData.puntos_tratados || [],
            analisis_juridico: memoData.analisis_juridico || "",
            proximos_pasos: memoData.proximos_pasos || [],
            riesgos: memoData.riesgos || [],
            texto_formateado: memoData.texto_formateado || "",
            areaLegal: memoData.areaLegal,
          }
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[TEMPLATE PREVIEW] Error ${res.status}:`, errorText);
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setPreviewHtml(data.html);
      setPreviewTitle(data.nombre || nombre);
    } catch (error) {
      console.error("Error al cargar preview:", error);
      setPreviewHtml(`<p class="text-red-500">Error al cargar la vista previa: ${error instanceof Error ? error.message : "Error desconocido"}</p>`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (id: string, nombre: string) => {
    try {
      const baseUrl = apiUrl || "";
      const downloadUrl = `${baseUrl}/api/templates/${encodeURIComponent(id)}/download`;
      console.log(`[TEMPLATE DOWNLOAD] Llamando a: ${downloadUrl}`);
      console.log(`[TEMPLATE DOWNLOAD] Enviando datos del memo para rellenar template...`);
      
      // Enviar datos del memo para que la IA rellene el template
      const resp = await fetch(downloadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memoData: {
            titulo: memoData.resumen || "",
            tipo_documento: memoData.tipo_documento || "",
            resumen: memoData.resumen || "",
            puntos_tratados: memoData.puntos_tratados || [],
            analisis_juridico: memoData.analisis_juridico || "",
            proximos_pasos: memoData.proximos_pasos || [],
            riesgos: memoData.riesgos || [],
            texto_formateado: memoData.texto_formateado || "",
            areaLegal: memoData.areaLegal,
          }
        }),
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`[TEMPLATE DOWNLOAD] Error ${resp.status}:`, errorText);
        throw new Error(`Error ${resp.status}: ${resp.statusText}`);
      }

      const blob = await resp.blob();
      const filename = `${nombre.replace(/\s+/g, "_")}_rellenado.docx`;
      
      // Crear un blob con el tipo correcto para asegurar la descarga
      const downloadBlob = new Blob([blob], { 
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
      });
      
      const blobUrl = window.URL.createObjectURL(downloadBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      
      // Limpiar después de un pequeño delay para asegurar que la descarga se inicie
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error("Error al descargar documento:", error);
      alert(`No se pudo descargar el documento: ${error instanceof Error ? error.message : "Error desconocido"}`);
    }
  };

  const getIcon = (tipoDocumento?: string) => {
    switch (tipoDocumento) {
      case "demanda":
      case "dictamen":
        return <Gavel className="h-6 w-6" />;
      case "acta":
      case "informe":
        return <Edit className="h-6 w-6" />;
      default:
        return <FileText className="h-6 w-6" />;
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg flex flex-col">
        <div className="p-6 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-700 dark:to-slate-800 flex items-center gap-4">
          <div className="bg-teal-500 p-3 rounded-lg text-white">
            <File className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            Documentos Sugeridos
          </h2>
        </div>

        <div className="p-6 flex-grow">
          {loadingSuggestions && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-slate-500">Buscando documentos sugeridos…</span>
            </div>
          )}

          {!loadingSuggestions && suggestedDocs.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">
              No hay documentos sugeridos para este memo.
            </p>
          )}

          {!loadingSuggestions && suggestedDocs.length > 0 && (
            <div className="space-y-4">
              {suggestedDocs.map((doc) => (
                <button
                  key={doc.id}
                  className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all duration-300 transform hover:scale-[1.02]"
                  onClick={() => handleGenerateSuggestedDoc(doc)}
                  disabled={generatingDoc === doc.id}
                >
                  <span className="text-blue-500 dark:text-blue-400">
                    {generatingDoc === doc.id ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      getIcon(doc.tipoDocumento)
                    )}
                  </span>
                  <div className="flex flex-col text-left flex-grow">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {doc.nombre}
                    </span>
                    {doc.descripcion && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {doc.descripcion}
                      </span>
                    )}
                  </div>
                  {generatingDoc === doc.id ? (
                    <span className="text-xs text-slate-500">Generando...</span>
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 ml-auto" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Preview */}
      {showPreviewModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100">
                {previewTitle}
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Contenido del Preview */}
            <div className="flex-1 overflow-auto px-6 py-4 bg-slate-50 dark:bg-slate-900/40">
              {generatingDoc && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-3 text-sm text-slate-500">Generando documento con datos del análisis…</span>
                </div>
              )}
              {!generatingDoc && generatedDoc && (
                <div className="space-y-4">
                  {generatedDoc.tienePlaceholders && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-800">
                        ⚠️ {generatedDoc.placeholdersCount} dato(s) pendiente(s) de completar. Hacé click en los <span className="bg-yellow-200 px-1 rounded font-mono">XXXXXX</span> para completarlos.
                      </p>
                    </div>
                  )}
                  <div className="text-sm text-slate-700 bg-white p-4 rounded-lg border border-slate-200 max-h-[500px] overflow-y-auto">
                    {renderContentWithPlaceholders(editedContent || generatedDoc.contenido)}
                  </div>
                  {generatedDoc.datosExtraidos && Object.keys(generatedDoc.datosExtraidos).length > 0 && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
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
              {!generatingDoc && !generatedDoc && loadingPreview && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-3 text-sm text-slate-500">Cargando vista previa…</span>
                </div>
              )}
              {!generatingDoc && !generatedDoc && !loadingPreview && previewHtml && (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-slate-800 dark:prose-headings:text-slate-200 prose-p:text-slate-700 dark:prose-p:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>

            {/* Footer del Modal con botones */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setGeneratedDoc(null);
                  setEditedContent("");
                  setEditingPlaceholder(null);
                  setSaved(false);
                }}
                className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
              <div className="flex gap-2">
                {generatedDoc && generatedDoc.tienePlaceholders && (
                  <button
                    onClick={() => {
                      const value = prompt(`Ingresá el valor para reemplazar todos los XXXXXX:`);
                      if (value) {
                        handleReplaceAllPlaceholders(value);
                      }
                    }}
                    className="px-3 py-2 rounded-lg text-xs bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                    title="Reemplazar todos los XXXXXX con el mismo valor"
                  >
                    🔄 Completar todos
                  </button>
                )}
                {generatedDoc && (
                  <button
                    onClick={handleSaveDocument}
                    className="px-3 py-2 rounded-lg text-xs bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-1"
                    title="Guardar documento en la bandeja"
                  >
                    {saved ? (
                      <>
                        <Check className="h-3 w-3" />
                        Guardado
                      </>
                    ) : (
                      <>
                        💾 Guardar
                      </>
                    )}
                  </button>
                )}
                {generatedDoc && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(editedContent || generatedDoc.contenido);
                    }}
                    className="px-3 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    📋 Copiar
                  </button>
                )}
                {!generatedDoc && previewId && (
                  <button
                    onClick={() => {
                      if (previewId) {
                        handleDownload(previewId, previewTitle);
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-2 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Descargar .docx
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
