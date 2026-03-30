import React, { useState, useRef } from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { Package, Plus, AlertTriangle, TrendingUp, Edit, Trash2, ArrowUpCircle, ArrowDownCircle, History, Upload, FileSpreadsheet, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const Inventory: React.FC = () => {
  const { items, isLoading, movements, createItem, updateItem, deleteItem, addMovement, lowStockItems, totalProducts, totalValue } = useInventory();
  const [showForm, setShowForm] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ product_name: '', sku: '', category: 'geral', quantity: 0, min_quantity: 5, unit: 'un', price: 0, description: '' });
  const [movForm, setMovForm] = useState({ type: 'in', quantity: 1, reason: '' });
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importInserting, setImportInserting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['.csv', '.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(ext)) {
      toast.error('Formato inválido. Use CSV, XLSX ou XLS.');
      return;
    }

    setImporting(true);
    setImportPreview([]);
    setShowImport(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/import-inventory`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setShowImport(false);
      } else if (data.products?.length > 0) {
        setImportPreview(data.products);
        toast.success(`${data.total} produtos encontrados na planilha`);
      } else {
        toast.error('Nenhum produto encontrado na planilha');
        setShowImport(false);
      }
    } catch (err: any) {
      toast.error('Erro ao processar arquivo: ' + err.message);
      setShowImport(false);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return;
    setImportInserting(true);
    try {
      const { error } = await supabase.from('inventory').insert(importPreview as any);
      if (error) throw error;
      toast.success(`${importPreview.length} produtos importados com sucesso!`);
      setShowImport(false);
      setImportPreview([]);
      // Refresh
      window.location.reload();
    } catch (err: any) {
      toast.error('Erro ao importar: ' + err.message);
    } finally {
      setImportInserting(false);
    }
  };

  const resetForm = () => setForm({ product_name: '', sku: '', category: 'geral', quantity: 0, min_quantity: 5, unit: 'un', price: 0, description: '' });

  const handleSave = () => {
    if (!form.product_name) return;
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, ...form } as any, { onSuccess: () => { setShowForm(false); setEditingItem(null); resetForm(); } });
    } else {
      createItem.mutate(form as any, { onSuccess: () => { setShowForm(false); resetForm(); } });
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({ product_name: item.product_name, sku: item.sku || '', category: item.category, quantity: item.quantity, min_quantity: item.min_quantity, unit: item.unit, price: item.price, description: item.description || '' });
    setShowForm(true);
  };

  const handleMovement = () => {
    if (!movementItem || movForm.quantity <= 0) return;
    addMovement.mutate({ inventory_id: movementItem.id, ...movForm }, {
      onSuccess: () => { setShowMovement(false); setMovementItem(null); setMovForm({ type: 'in', quantity: 1, reason: '' }); }
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie produtos e movimentações</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Importar Planilha
          </Button>
          <Button onClick={() => { resetForm(); setEditingItem(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar Produto
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><Package className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Produtos Ativos</p>
              <p className="text-xl font-bold text-foreground">{totalProducts}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-green-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold text-foreground">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Estoque Baixo</p>
              <p className="text-xl font-bold text-foreground">{lowStockItems.length}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Nenhum produto cadastrado</div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-muted-foreground font-medium">Produto</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">SKU</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Categoria</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Qtd</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Preço</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-medium text-foreground">{item.product_name}</td>
                      <td className="p-3 text-muted-foreground">{item.sku || '-'}</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">{item.category}</span></td>
                      <td className={`p-3 text-right font-medium ${item.quantity <= item.min_quantity ? 'text-red-500' : 'text-foreground'}`}>
                        {item.quantity} {item.unit}
                      </td>
                      <td className="p-3 text-right text-foreground">R$ {Number(item.price).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${item.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {item.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Entrada" onClick={() => { setMovementItem(item); setMovForm({ type: 'in', quantity: 1, reason: '' }); setShowMovement(true); }}>
                            <ArrowUpCircle className="w-4 h-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Saída" onClick={() => { setMovementItem(item); setMovForm({ type: 'out', quantity: 1, reason: '' }); setShowMovement(true); }}>
                            <ArrowDownCircle className="w-4 h-4 text-red-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteItem.mutate(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements">
          {movements.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Nenhuma movimentação</div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-muted-foreground font-medium">Data</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Produto</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Tipo</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Qtd</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Motivo</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(mov => (
                    <tr key={mov.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-muted-foreground">{format(new Date(mov.created_at), "dd/MM HH:mm", { locale: ptBR })}</td>
                      <td className="p-3 font-medium text-foreground">{(mov.inventory as any)?.product_name || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${mov.type === 'in' ? 'bg-green-500/10 text-green-500' : mov.type === 'out' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                          {mov.type === 'in' ? 'Entrada' : mov.type === 'out' ? 'Saída' : 'Ajuste'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-foreground">{mov.quantity}</td>
                      <td className="p-3 text-muted-foreground">{mov.reason || '-'}</td>
                      <td className="p-3 text-muted-foreground">{mov.created_by === 'nina' ? '🤖 IA' : mov.created_by === 'manual' ? '👤 Manual' : mov.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Editar Produto' : 'Novo Produto'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} /></div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Quantidade</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} /></div>
              <div><Label>Mínimo</Label><Input type="number" value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: Number(e.target.value) }))} /></div>
              <div><Label>Unidade</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
            </div>
            <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} /></div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <Button className="w-full" onClick={handleSave}>{editingItem ? 'Salvar' : 'Criar Produto'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{movForm.type === 'in' ? 'Entrada' : 'Saída'} — {movementItem?.product_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant={movForm.type === 'in' ? 'default' : 'outline'} className="flex-1" onClick={() => setMovForm(f => ({ ...f, type: 'in' }))}>Entrada</Button>
              <Button variant={movForm.type === 'out' ? 'default' : 'outline'} className="flex-1" onClick={() => setMovForm(f => ({ ...f, type: 'out' }))}>Saída</Button>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min={1} value={movForm.quantity} onChange={e => setMovForm(f => ({ ...f, quantity: Number(e.target.value) }))} /></div>
            <div><Label>Motivo</Label><Input value={movForm.reason} onChange={e => setMovForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex: Reposição, Venda..." /></div>
            <Button className="w-full" onClick={handleMovement}>Registrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
