import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, MoreHorizontal, UserPlus, MessageSquare, Loader2, Mail, Phone, Users, X, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { api } from '../services/api';
import { Contact } from '../types';
import AddContactModal from './AddContactModal';

type FilterState = {
  status: string;
  tags: string[];
  hasEmail: string;
  sortBy: string;
  scoreMin: string;
};

const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    tags: [],
    hasEmail: 'all',
    sortBy: 'recent',
    scoreMin: 'all',
  });
  const navigate = useNavigate();

  useEffect(() => {
    const loadContacts = async () => {
      setLoading(true);
      try {
        const data = await api.fetchContacts();
        setContacts(data);
      } catch (error) {
        console.error("Erro ao carregar contatos", error);
      } finally {
        setLoading(false);
      }
    };
    loadContacts();
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    contacts.forEach(c => c.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [contacts]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status !== 'all') count++;
    if (filters.tags.length > 0) count++;
    if (filters.hasEmail !== 'all') count++;
    if (filters.sortBy !== 'recent') count++;
    if (filters.scoreMin !== 'all') count++;
    return count;
  }, [filters]);

  const filteredContacts = useMemo(() => {
    let result = contacts.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (
        (c.name?.toLowerCase() || '').includes(term) ||
        (c.phone || '').includes(term) ||
        (c.email?.toLowerCase() || '').includes(term)
      );
      if (!matchesSearch) return false;

      if (filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters.hasEmail === 'yes' && !c.email) return false;
      if (filters.hasEmail === 'no' && c.email) return false;
      if (filters.tags.length > 0 && !filters.tags.some(t => c.tags?.includes(t))) return false;

      return true;
    });

    if (filters.sortBy === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (filters.sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.lastContact).getTime() - new Date(b.lastContact).getTime());
    } else {
      result.sort((a, b) => new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime());
    }

    return result;
  }, [contacts, searchTerm, filters]);

  const clearFilters = () => {
    setFilters({ status: 'all', tags: [], hasEmail: 'all', sortBy: 'recent', scoreMin: 'all' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'customer': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'lead': return 'bg-primary/10 text-primary border-primary/20';
      case 'churned': return 'bg-secondary text-muted-foreground border-border';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  const handleStartConversation = (contact: Contact) => {
    navigate(`/chat?contact=${encodeURIComponent(contact.phone)}`);
  };

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-background text-foreground">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Contatos</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie sua base de leads e clientes.</p>
        </div>
      </div>

      <AddContactModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => api.fetchContacts().then(setContacts)}
      />

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-2 rounded-xl border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou telefone"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground transition-all"
            />
          </div>
          <Button 
            variant={showFilters ? 'primary' : 'outline'} 
            className="w-full sm:w-auto relative"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros Avançados
            {activeFilterCount > 0 && (
              <span className="ml-2 h-5 w-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Filtros Avançados</h4>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Todos</option>
                  <option value="lead">Lead</option>
                  <option value="customer">Cliente</option>
                  <option value="churned">Churned</option>
                </select>
              </div>

              {/* Has Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <select
                  value={filters.hasEmail}
                  onChange={e => setFilters(f => ({ ...f, hasEmail: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Com email</option>
                  <option value="no">Sem email</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
                <select
                  value={filters.sortBy}
                  onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="recent">Mais recente</option>
                  <option value="oldest">Mais antigo</option>
                  <option value="name">Nome A-Z</option>
                </select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {allTags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nenhuma tag</span>
                  ) : allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        setFilters(f => ({
                          ...f,
                          tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
                        }));
                      }}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        filters.tags.includes(tag)
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          {filteredContacts.length} contato{filteredContacts.length !== 1 ? 's' : ''} encontrado{filteredContacts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
        {loading ? (
           <div className="flex flex-col items-center justify-center h-80">
             <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
             <span className="text-sm text-muted-foreground animate-pulse">Carregando base de dados...</span>
           </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum contato encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchTerm || activeFilterCount > 0 ? 'Tente ajustar os filtros' : 'Os contatos aparecerão aqui'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary text-muted-foreground border-b border-border font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Nome / Telefone</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Canais</th>
                  <th className="px-6 py-4">Tags</th>
                  <th className="px-6 py-4">Última Interação</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-secondary/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-muted border border-border flex items-center justify-center text-sm font-bold text-primary shadow-inner">
                          {(contact.name || contact.phone || '?').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {contact.name || 'Sem nome'}
                            </div>
                            <div className="text-xs text-muted-foreground">{contact.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap inline-flex ${getStatusColor(contact.status)}`}>
                        {contact.status === 'customer' ? 'Cliente Ativo' : contact.status === 'lead' ? 'Lead Qualificado' : 'Churned'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <Mail className="w-3.5 h-3.5" />
                              {contact.email}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Phone className="w-3.5 h-3.5" />
                            {contact.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {(contact.tags || []).slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/20">
                            {tag}
                          </span>
                        ))}
                        {(contact.tags || []).length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{contact.tags!.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-muted-foreground">{new Date(contact.lastContact).toLocaleDateString('pt-BR')}</span>
                       <div className="text-[10px] text-muted-foreground/70">via WhatsApp</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <Button
                          size="sm" 
                          variant="primary" 
                          className="h-8 w-8 p-0 rounded-lg shadow-none" 
                          title="Iniciar Conversa"
                          onClick={() => handleStartConversation(contact)}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 rounded-lg cursor-not-allowed opacity-50"
                          disabled
                          title="Em breve: Mais opções"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contacts;
