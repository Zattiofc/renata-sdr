import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Search, Filter, Upload, Trash2, Edit2, Eye, X, ExternalLink, Package, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { logAuditEvent } from '@/lib/auditLog';
import { toast } from 'sonner';
import { Button } from './Button';

interface OfficialMaterial {
  id: string;
  titulo: string;
  linha_negocio: string;
  produto_relacionado: string | null;
  tipo: string;
  idioma: string;
  versao: string;
  data_publicacao: string;
  status: string;
  arquivo_url: string;
  thumbnail_url: string | null;
  tags: string[];
  observacoes_uso: string | null;
  created_at: string;
  updated_at: string;
}

const LINHAS = [
  { value: 'carnes', label: 'Carnes' },
  { value: 'acompanhamentos', label: 'Acompanhamentos' },
  { value: 'combos', label: 'Combos' },
  { value: 'institucional', label: 'Institucional' },
];

const TIPOS = [
  { value: 'folheto', label: 'Folheto' },
  { value: 'ficha_tecnica', label: 'Ficha Técnica' },
  { value: 'apresentacao', label: 'Apresentação' },
  { value: 'exames', label: 'Exames' },
  { value: 'institucional', label: 'Institucional' },
];

const LINHA_COLORS: Record<string, string> = {
  humano: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  veterinario: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  servicos: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  hexai: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const Materials: React.FC = () => {
  const { isAdmin } = useCompanySettings();
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLinha, setFilterLinha] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<OfficialMaterial | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Form state
  const [formData, setFormData] = useState({
    titulo: '',
    linha_negocio: 'humano',
    produto_relacionado: '',
    tipo: 'folheto',
    idioma: 'pt-BR',
    versao: '1.0',
    status: 'ativo',
    arquivo_url: '',
    thumbnail_url: '',
    tags: '',
    observacoes_uso: '',
  });

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('official_materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (filterLinha) query = query.eq('linha_negocio', filterLinha);
    if (filterTipo) query = query.eq('tipo', filterTipo);

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar materiais');
      console.error(error);
    } else {
      setMaterials((data as any[]) || []);
    }
    setLoading(false);
  }, [filterLinha, filterTipo]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const analyzeWithAI = async (fileUrl: string, fileName: string) => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-material', {
        body: { arquivo_url: fileUrl, file_name: fileName },
      });
      if (error) throw error;
      if (data?.result) {
        const r = data.result;
        setFormData(prev => ({
          ...prev,
          titulo: r.titulo || prev.titulo,
          linha_negocio: r.linha_negocio || prev.linha_negocio,
          tipo: r.tipo || prev.tipo,
          produto_relacionado: r.produto_relacionado || prev.produto_relacionado,
          tags: Array.isArray(r.tags) ? r.tags.join(', ') : prev.tags,
          observacoes_uso: r.observacoes_uso || prev.observacoes_uso,
        }));
        toast.success('IA preencheu os campos automaticamente!');
      }
    } catch (e) {
      console.error('AI analysis error:', e);
      toast.error('Não foi possível analisar o arquivo com IA');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from('materials').upload(filePath, file);
    if (error) {
      toast.error('Erro no upload do arquivo');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('materials').getPublicUrl(filePath);
    setFormData(prev => ({ ...prev, arquivo_url: urlData.publicUrl }));
    setUploading(false);
    toast.success('Arquivo enviado!');

    // Auto-analyze with AI
    analyzeWithAI(urlData.publicUrl, file.name);
  };

  const resetForm = () => {
    setFormData({
      titulo: '', linha_negocio: 'humano', produto_relacionado: '', tipo: 'folheto',
      idioma: 'pt-BR', versao: '1.0', status: 'ativo', arquivo_url: '',
      thumbnail_url: '', tags: '', observacoes_uso: '',
    });
    setEditingMaterial(null);
    setShowForm(false);
  };

  const handleEdit = (m: OfficialMaterial) => {
    setEditingMaterial(m);
    setFormData({
      titulo: m.titulo,
      linha_negocio: m.linha_negocio,
      produto_relacionado: m.produto_relacionado || '',
      tipo: m.tipo,
      idioma: m.idioma,
      versao: m.versao,
      status: m.status,
      arquivo_url: m.arquivo_url,
      thumbnail_url: m.thumbnail_url || '',
      tags: (m.tags || []).join(', '),
      observacoes_uso: m.observacoes_uso || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.arquivo_url) {
      toast.error('Título e arquivo são obrigatórios');
      return;
    }

    const payload = {
      titulo: formData.titulo,
      linha_negocio: formData.linha_negocio,
      produto_relacionado: formData.produto_relacionado || null,
      tipo: formData.tipo,
      idioma: formData.idioma,
      versao: formData.versao,
      status: formData.status,
      arquivo_url: formData.arquivo_url,
      thumbnail_url: formData.thumbnail_url || null,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      observacoes_uso: formData.observacoes_uso || null,
    };

    if (editingMaterial) {
      const { error } = await supabase
        .from('official_materials')
        .update(payload as any)
        .eq('id', editingMaterial.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      logAuditEvent('material.updated', 'official_material', editingMaterial.id, { titulo: payload.titulo });
      toast.success('Material atualizado!');
    } else {
      const { error } = await supabase
        .from('official_materials')
        .insert(payload as any);
      if (error) { toast.error('Erro ao criar'); return; }
      logAuditEvent('material.created', 'official_material', undefined, { titulo: payload.titulo });
      toast.success('Material criado!');
    }

    resetForm();
    fetchMaterials();
  };

  const handleDelete = async (m: OfficialMaterial) => {
    if (!confirm(`Desativar "${m.titulo}"?`)) return;
    const { error } = await supabase
      .from('official_materials')
      .update({ status: 'arquivado' } as any)
      .eq('id', m.id);
    if (error) { toast.error('Erro ao arquivar'); return; }
    logAuditEvent('material.archived', 'official_material', m.id, { titulo: m.titulo });
    toast.success('Material arquivado');
    fetchMaterials();
  };

  const filtered = materials.filter(m =>
    m.titulo.toLowerCase().includes(search.toLowerCase()) ||
    (m.produto_relacionado || '').toLowerCase().includes(search.toLowerCase())
  );

  // Send log stats
  const [stats, setStats] = useState({ total: 0, sent: 0, topMaterial: '' });
  useEffect(() => {
    const fetchStats = async () => {
      const { count } = await supabase.from('material_send_logs').select('*', { count: 'exact', head: true }) as any;
      setStats(prev => ({ ...prev, total: materials.length, sent: count || 0 }));
    };
    fetchStats();
  }, [materials.length]);

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Materiais Oficiais</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Biblioteca de folhetos, fichas técnicas e apresentações comerciais.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Material
          </Button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de Materiais</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-2xl font-bold text-emerald-500">{materials.filter(m => m.status === 'ativo').length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Envios Registrados</p>
          <p className="text-2xl font-bold text-primary">{stats.sent}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar materiais..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filterLinha}
          onChange={e => setFilterLinha(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm"
        >
          <option value="">Todas as linhas</option>
          {LINHAS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">
                {editingMaterial ? 'Editar Material' : 'Novo Material'}
              </h3>
              <button onClick={resetForm} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Título *</label>
                <input value={formData.titulo} onChange={e => setFormData(p => ({ ...p, titulo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Linha de Negócio</label>
                  <select value={formData.linha_negocio} onChange={e => setFormData(p => ({ ...p, linha_negocio: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm">
                    {LINHAS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tipo</label>
                  <select value={formData.tipo} onChange={e => setFormData(p => ({ ...p, tipo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm">
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Produto Relacionado</label>
                <input value={formData.produto_relacionado} onChange={e => setFormData(p => ({ ...p, produto_relacionado: e.target.value }))}
                  placeholder="Ex: Magnifico Open, S-Scan..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Versão</label>
                  <input value={formData.versao} onChange={e => setFormData(p => ({ ...p, versao: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm">
                    <option value="ativo">Ativo</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Arquivo *</label>
                {formData.arquivo_url ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="truncate flex-1 text-foreground">{formData.arquivo_url.split('/').pop()}</span>
                      <button onClick={() => setFormData(p => ({ ...p, arquivo_url: '' }))} className="text-destructive hover:text-destructive/80"><X className="w-3 h-3" /></button>
                    </div>
                    {analyzing && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-primary">IA analisando o documento e preenchendo campos...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted transition-colors">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{uploading ? 'Enviando...' : 'Clique para enviar arquivo (a IA preencherá os campos)'}</span>
                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg" />
                  </label>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tags (separadas por vírgula)</label>
                <input value={formData.tags} onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))}
                  placeholder="musculoesquelético, corpo inteiro, alto campo..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações de Uso</label>
                <textarea value={formData.observacoes_uso} onChange={e => setFormData(p => ({ ...p, observacoes_uso: e.target.value }))}
                  rows={2} placeholder="Quando/como usar este material..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="primary" onClick={handleSave} className="flex-1">
                  {editingMaterial ? 'Atualizar' : 'Criar Material'}
                </Button>
                <Button variant="secondary" onClick={resetForm} className="flex-1">Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Materials Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nenhum material encontrado</p>
          {isAdmin && <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Material" para adicionar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground text-sm truncate">{m.titulo}</h4>
                  {m.produto_relacionado && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.produto_relacionado}</p>
                  )}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ml-2 whitespace-nowrap ${LINHA_COLORS[m.linha_negocio] || 'bg-muted text-muted-foreground'}`}>
                  {LINHAS.find(l => l.value === m.linha_negocio)?.label || m.linha_negocio}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {TIPOS.find(t => t.value === m.tipo)?.label || m.tipo}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  v{m.versao}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.status === 'ativo' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'}`}>
                  {m.status}
                </span>
              </div>
              {m.tags && m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {m.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{tag}</span>
                  ))}
                  {m.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{m.tags.length - 3}</span>}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={m.arquivo_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Eye className="w-3 h-3" /> Ver
                </a>
                {isAdmin && (
                  <>
                    <button onClick={() => handleEdit(m)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => handleDelete(m)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 ml-auto">
                      <Trash2 className="w-3 h-3" /> Arquivar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Materials;
