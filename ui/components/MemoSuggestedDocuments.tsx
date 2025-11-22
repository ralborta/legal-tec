"use client";
import React from "react";
import { FileText, Gavel, Edit, File, ChevronRight } from "lucide-react";

type SuggestedDocument = {
  id: string;
  titulo: string;
  descripcion?: string;
  icono?: "description" | "gavel" | "edit_document" | "file_present";
};

interface Props {
  memoId: string;
  documentos: SuggestedDocument[];
  apiUrl: string;
}

export const MemoSuggestedDocuments: React.FC<Props> = ({ memoId, documentos, apiUrl }) => {
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const handleClick = async (docId: string, titulo: string) => {
    if (downloading === docId) return; // Evitar múltiples clicks

    setDownloading(docId);
    try {
      const resp = await fetch(`${apiUrl}/api/memos/${memoId}/documents/${docId}/download`);
      
      if (!resp.ok) {
        throw new Error(`Error ${resp.status}: ${resp.statusText}`);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${titulo.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al descargar documento:", error);
      alert(`No se pudo descargar el documento: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      setDownloading(null);
    }
  };

  const getIcon = (icono?: string) => {
    switch (icono) {
      case "gavel":
        return <Gavel className="h-6 w-6" />;
      case "edit_document":
        return <Edit className="h-6 w-6" />;
      case "file_present":
        return <File className="h-6 w-6" />;
      case "description":
      default:
        return <FileText className="h-6 w-6" />;
    }
  };

  if (!documentos?.length) {
    return null;
  }

  return (
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
        <div className="space-y-4">
          {documentos.map((doc) => (
            <button
              key={doc.id}
              disabled={downloading === doc.id}
              className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleClick(doc.id, doc.titulo)}
            >
              <span className="text-blue-500 dark:text-blue-400">
                {getIcon(doc.icono)}
              </span>
              <div className="flex flex-col text-left flex-grow">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {doc.titulo}
                </span>
                {doc.descripcion && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {doc.descripcion}
                  </span>
                )}
              </div>
              {downloading === doc.id ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 ml-auto" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

