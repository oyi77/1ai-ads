import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Send, Loader2, Sparkles, User } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function MetaAiPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.post<{ response: string }>('/meta-ai/chat', { message }),
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: typeof data === 'string' ? data : (data as { response?: string }).response || 'No response',
        timestamp: Date.now(),
      }]);
    },
    onError: (err) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
        timestamp: Date.now(),
      }]);
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    setInput('');
    chatMutation.mutate(text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
          <Sparkles size={20} style={{ display: 'inline', marginRight: 8, color: 'var(--accent)' }} />
          Meta AI Chat
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Ask AI to help with ad copy, targeting, creative ideas, campaign analysis, and more.
        </p>
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: 20,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
        marginBottom: 16,
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
            <Bot size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>Start a conversation</p>
            <p style={{ fontSize: '0.8rem' }}>Ask about ad strategies, get copy suggestions, or analyze performance.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
              {['Write ad copy for a fashion brand', 'Suggest targeting for young adults', 'Analyze my campaign performance'].map(prompt => (
                <button key={prompt} onClick={() => { setInput(prompt); }} style={chipStyle}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 10,
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={14} color="var(--bg-deep)" />
                  </div>
                )}
                <div style={{
                  maxWidth: '75%', padding: '10px 16px', borderRadius: 12, fontSize: '0.85rem', lineHeight: 1.6,
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface, #1a1a2e)',
                  color: msg.role === 'user' ? 'var(--bg-deep)' : 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} />
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={14} color="var(--bg-deep)" />
                </div>
                <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-surface, #1a1a2e)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask Meta AI anything about your ads..."
          style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}
        />
        <button onClick={handleSend} disabled={!input.trim() || chatMutation.isPending} style={sendBtn}>
          {chatMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

const chipStyle: CSSProperties = {
  padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', fontSize: '0.75rem',
};

const sendBtn: CSSProperties = {
  padding: '12px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center',
};
