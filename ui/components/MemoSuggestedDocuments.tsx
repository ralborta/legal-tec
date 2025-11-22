"use client";
import React from "react";
import { FileText, Gavel, Edit, File, ChevronRight, X, Download, Loader2 } from "lucide-react";

type SuggestedDocument = {
  id: string;
  nombre: string;
  descripcion?: string;
  tipoDocumento?: string;
};

interface Props {
  memoId: string;
  memoData: {
    areaLegal?: string;
    tipo_documento?: string;
    resumen?: string;
    puntos_tratados?: string[];
    analisis_juridico?: string;
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

  // Cargar sugerencias cuando se monta el componente
  React.useEffect(() => {
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`${apiUrl}/api/templates/suggest`, {
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

  const handleOpenTemplate = async (id: string, nombre: string) => {
    setLoadingPreview(true);
    setPreviewHtml(null);
    setPreviewTitle(nombre);
    setPreviewId(id);
    setShowPreviewModal(true);

    try {
      const res = await fetch(`${apiUrl}/api/templates/${id}/preview`);
      
      if (!res.ok) {
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
      const resp = await fetch(`${apiUrl}/api/templates/${id}/download`);
      
      if (!resp.ok) {
        throw new Error(`Error ${resp.status}: ${resp.statusText}`);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombre.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
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
                  onClick={() => handleOpenTemplate(doc.id, doc.nombre)}
                >
                  <span className="text-blue-500 dark:text-blue-400">
                    {getIcon(doc.tipoDocumento)}
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
                  <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 ml-auto" />
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
              {loadingPreview && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-3 text-sm text-slate-500">Cargando vista previa…</span>
                </div>
              )}
              {!loadingPreview && previewHtml && (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-slate-800 dark:prose-headings:text-slate-200 prose-p:text-slate-700 dark:prose-p:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>

            {/* Footer del Modal con botones */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
              {previewId && (
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
      )}
    </>
  );
};
