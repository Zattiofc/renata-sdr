import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InventoryItem {
  id: string;
  product_name: string;
  sku: string | null;
  category: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  inventory_id: string;
  type: string;
  quantity: number;
  reason: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  created_by: string;
  created_at: string;
  inventory?: InventoryItem;
}

export const useInventory = () => {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('product_name');
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ['inventory_movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, inventory(*)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as InventoryMovement[];
    },
  });

  const createItem = useMutation({
    mutationFn: async (item: Partial<InventoryItem>) => {
      const { error } = await supabase.from('inventory').insert(item as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Produto adicionado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
      const { error } = await supabase.from('inventory').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Produto atualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_movements'] });
      toast.success('Produto removido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addMovement = useMutation({
    mutationFn: async (mov: { inventory_id: string; type: string; quantity: number; reason?: string }) => {
      const { error: movError } = await supabase.from('inventory_movements').insert({
        inventory_id: mov.inventory_id,
        type: mov.type,
        quantity: mov.quantity,
        reason: mov.reason || null,
        created_by: 'manual',
      } as any);
      if (movError) throw movError;

      // Update quantity
      const item = items.find(i => i.id === mov.inventory_id);
      if (!item) throw new Error('Produto não encontrado');
      const delta = mov.type === 'in' ? mov.quantity : -mov.quantity;
      const newQty = item.quantity + delta;
      if (newQty < 0) throw new Error('Estoque insuficiente');

      const { error } = await supabase
        .from('inventory')
        .update({ quantity: newQty } as any)
        .eq('id', mov.inventory_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_movements'] });
      toast.success('Movimentação registrada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lowStockItems = items.filter(i => i.is_active && i.quantity <= i.min_quantity);
  const totalProducts = items.filter(i => i.is_active).length;
  const totalValue = items.reduce((sum, i) => sum + (i.is_active ? i.quantity * i.price : 0), 0);

  return {
    items, isLoading, movements, movementsLoading,
    createItem, updateItem, deleteItem, addMovement,
    lowStockItems, totalProducts, totalValue,
  };
};
