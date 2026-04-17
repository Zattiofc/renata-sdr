import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  debug?: any;
}

interface PromptTestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemPrompt: string;
}

const TypingIndicator = () => (
  <div className="flex items-end gap-2 mb-3">
    <div className="max-w-[75%] rounded-2xl rounded-bl-md px-4 py-3 bg-muted text-foreground">
      <div className="flex gap-1 items-center h-5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

const PromptTestModal: React.FC<PromptTestModalProps> = ({ open, onOpenChange, systemPrompt }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contactName, setContactName] = useState('Lucas');
  const [contactPhone, setContactPhone] = useState('5511999999999');
  const [lastDebug, setLastDebug] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleClear = () => {
    setMessages([]);
    setInput('');
    setLastDebug(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Send only role/content pairs for the API
      const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('test-prompt-chat', {
        body: { messages: apiMessages, systemPrompt, contactName, contactPhone },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      if (data?.debug) setLastDebug(data.debug);
      const responseText: string = data?.response || '';
      const parts = Array.isArray(data?.chunks) && data.chunks.length > 0
        ? data.chunks.filter((p: string) => p.trim())
        : responseText.split('\n\n').filter((p: string) => p.trim());

      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        setMessages(prev => [...prev, { role: 'assistant', content: parts[i].trim() }]);
      }

      if (parts.length === 0 && responseText.trim()) {
        setMessages(prev => [...prev, { role: 'assistant', content: responseText.trim() }]);
      }
    } catch (err) {
      console.error('Error testing prompt:', err);
      toast.error('Erro ao testar o prompt. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[680px] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg flex items-center gap-2">
                Simulação Real
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  RAG + Estoque + Tools
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Conversa com o agente real (busca na base + consulta de estoque). Vendas em modo dry-run.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-destructive gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </Button>
          </div>
          <div className="flex gap-2 pt-3">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nome do cliente"
              className="flex-1 h-8 rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Telefone (5511...)"
              className="flex-1 h-8 rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          {lastDebug && (
            <div className="flex flex-wrap gap-1.5 pt-2 text-[10px]">
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                RAG: {lastDebug.ragMode} ({lastDebug.ragChunks})
              </span>
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                Estoque: {lastDebug.inventoryItemsAvailable} itens
              </span>
              {lastDebug.toolCalls?.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Tools: {lastDebug.toolCalls.map((t: any) => t.tool).join(', ')}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
          {messages.length === 0 && !isLoading && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Envie uma mensagem para testar o prompt
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={isLoading}
              className="flex-1 h-10 rounded-lg border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="h-10 w-10 rounded-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromptTestModal;
