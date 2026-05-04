import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, Upload, Trash2, Loader2, FileText, Plus, AlertCircle, CheckCircle2, FileSpreadsheet, FileType, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface KnowledgeFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  category: string | null;
  created_at: string;
}

const ACCEPTED_FORMATS = '.txt,.md,.csv,.pdf,.docx,.xlsx,.xls';
const ACCEPTED_MIME = [
  'text/plain', 'text/markdown', 'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const TEXT_FORMATS = ['txt', 'md', 'csv'];
const BINARY_FORMATS = ['pdf', 'docx', 'xlsx', 'xls'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const KnowledgeBase: React.FC = () => {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualText, setManualText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const processEmbeddingsBatched = async (fileId: string, content: string) => {
    let batchStart = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: { file_id: fileId, content, batch_start: batchStart }
      });

      if (error) {
        console.error('Error generating embeddings batch:', error);
        await supabase
          .from('knowledge_files' as any)
          .update({ status: 'error', error_message: error.message })
          .eq('id', fileId);
        return false;
      }

      hasMore = data?.has_more || false;
      batchStart = data?.next_batch_start || 0;
    }

    return true;
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_files' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles((data || []) as unknown as KnowledgeFile[]);
    } catch (error) {
      console.error('Error loading knowledge files:', error);
    } finally {
      setLoading(false);
    }
  };

  const addManualText = async () => {
    if (!manualText.trim()) {
      toast.error('Digite algum conteúdo');
      return;
    }

    setAdding(true);
    try {
      const fileName = manualTitle.trim() || `Texto manual ${new Date().toLocaleDateString('pt-BR')}`;

      const { data: fileData, error: fileError } = await supabase
        .from('knowledge_files' as any)
        .insert({
          file_name: fileName,
          file_type: 'manual',
          file_size: manualText.length,
          status: 'processing'
        })
        .select()
        .single();

      if (fileError) throw fileError;

      const file = fileData as unknown as KnowledgeFile;
      const success = await processEmbeddingsBatched(file.id, manualText);

      if (!success) {
        toast.error('Erro ao processar embeddings');
      }

      setManualText('');
      setManualTitle('');
      toast.success('Documento adicionado! Processando embeddings...');
      
      setTimeout(loadFiles, 3000);
      loadFiles();
    } catch (error: any) {
      console.error('Error adding manual text:', error);
      toast.error('Erro ao adicionar texto: ' + error.message);
    } finally {
      setAdding(false);
    }
  };

  const processFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isText = TEXT_FORMATS.includes(ext);
    const isBinary = BINARY_FORMATS.includes(ext);

    if (!isText && !isBinary) {
      toast.error('Formatos suportados: .txt, .md, .csv, .pdf, .docx, .xlsx');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande (máx 20MB)');
      return;
    }

    setUploading(true);
    try {
      if (isText) {
        // Text files: direct extraction
        const content = await file.text();

        const { data: fileData, error: fileError } = await supabase
          .from('knowledge_files' as any)
          .insert({
            file_name: file.name,
            file_type: ext,
            file_size: file.size,
            status: 'processing'
          })
          .select()
          .single();

        if (fileError) throw fileError;

        const fileRecord = fileData as unknown as KnowledgeFile;
        const success = await processEmbeddingsBatched(fileRecord.id, content);

        if (!success) {
          toast.error('Erro ao processar embeddings');
        }
      } else {
        // Binary files: upload to storage, then extract via edge function
        const storagePath = `${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('knowledge-docs')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Create file record
        const { data: fileData, error: fileError } = await supabase
          .from('knowledge_files' as any)
          .insert({
            file_name: file.name,
            file_type: ext,
            file_size: file.size,
            status: 'processing',
            storage_path: storagePath
          })
          .select()
          .single();

        if (fileError) throw fileError;

        const fileRecord = fileData as unknown as KnowledgeFile;

        // Call extract-document edge function
        toast.info(`Analisando ${file.name} com IA...`);
        
        const { data: extractResult, error: extractError } = await supabase.functions.invoke('extract-document', {
          body: {
            file_id: fileRecord.id,
            storage_path: storagePath,
            file_type: ext,
            file_name: file.name
          }
        });

        if (extractError) {
          console.error('Extract error:', extractError);
          toast.error('Erro ao extrair texto do documento');
          await supabase
            .from('knowledge_files' as any)
            .update({ status: 'error', error_message: extractError.message })
            .eq('id', fileRecord.id);
        } else if (extractResult?.text) {
          // Now generate embeddings from extracted text
          const success = await processEmbeddingsBatched(fileRecord.id, extractResult.text);
          if (!success) {
            toast.error('Erro ao processar embeddings');
          }
        }
      }

      toast.success('Arquivo processado! Gerando embeddings...');
      setTimeout(loadFiles, 3000);
      loadFiles();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao enviar arquivo: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = '';
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    for (const file of droppedFiles) {
      await processFile(file);
    }
  }, []);

  const deleteFile = async (fileId: string) => {
    try {
      // Find file to get storage_path
      const file = files.find(f => f.id === fileId);
      
      const { error } = await supabase
        .from('knowledge_files' as any)
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      // Delete from storage if binary file
      if (file && (file as any).storage_path) {
        await supabase.storage
          .from('knowledge-docs')
          .remove([(file as any).storage_path]);
      }

      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('Documento removido');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return <FileType className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'docx':
        return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      case 'xlsx':
      case 'xls':
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-green-500 flex-shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Pronto
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processando
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 border border-red-500/20">
            <AlertCircle className="w-3 h-3" />
            Erro
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryLabel = (category: string | null) => {
    const labels: Record<string, string> = {
      produto_servico: '🏷️ Produto',
      oferta_precos: '💰 Oferta',
      precos: '💰 Preços',
      faq: '❓ FAQ',
      politicas: '📋 Políticas',
      provas_sociais: '⭐ Provas Sociais',
      scripts_vendas: '📝 Scripts',
      geral: '📄 Geral',
    };
    return category ? labels[category] || '📄 ' + category : null;
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-6"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-3 mb-4">
        <BookOpen className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Base de Conhecimento</h3>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Adicione documentos para a IA usar como contexto nas conversas.
        Suporta <strong>PDF, DOCX, XLSX, CSV, TXT e MD</strong>. 
        Documentos são analisados por IA, organizados por categoria e indexados com busca semântica (RAG).
      </p>

      {/* Drag & Drop Zone */}
      {isDragging && (
        <div className="mb-4 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 p-10 transition-all">
          <div className="text-center">
            <Upload className="w-10 h-10 mx-auto mb-2 text-primary animate-bounce" />
            <p className="text-sm font-medium text-primary">Solte o arquivo aqui</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, CSV, TXT, MD (máx 20MB)</p>
          </div>
        </div>
      )}

      {/* Manual text input */}
      <div className="space-y-3 mb-6">
        <Input
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="Título do documento (opcional)"
          className="text-sm"
        />
        <Textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Cole aqui informações sobre sua empresa, produtos, serviços, FAQ, scripts de atendimento..."
          rows={5}
          className="text-sm font-mono"
        />
        <div className="flex gap-2">
          <Button
            onClick={addManualText}
            disabled={adding || !manualText.trim()}
            size="sm"
            className="gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar Texto
          </Button>

          <label>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 cursor-pointer"
              disabled={uploading}
              asChild
            >
              <span>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload arquivo
                <input
                  type="file"
                  accept={ACCEPTED_FORMATS}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum documento adicionado</p>
          <p className="text-xs mt-1">Adicione textos ou arquivos para enriquecer as respostas da IA</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Documentos ({files.length})
          </h4>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted border border-border"
            >
              <div className="flex items-center gap-3 min-w-0">
                {getFileIcon(file.file_type)}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{file.file_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {getStatusBadge(file.status)}
                    {file.chunk_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {file.chunk_count} chunks
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {file.file_type === 'manual' ? 'Texto' : file.file_type.toUpperCase()}
                    </span>
                    {file.category && file.category !== 'geral' && (
                      <span className="text-[10px] text-muted-foreground">
                        {getCategoryLabel(file.category)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => deleteFile(file.id)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
