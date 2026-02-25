import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePerson } from '../context/PersonContext';

const SUGGESTIONS = [
  "Whose turn is it to choose?",
  "What did we watch last month?",
  "Find a comedy for tonight",
  "What's on the family watchlist?",
  "What are Davin's top-rated movies?",
];

// Parse [[id:Title Name]] into clickable links
function parseContent(text) {
  const parts = [];
  const regex = /\[\[(\d+):([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'link', id: match[1], title: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return parts;
}

function MessageContent({ content }) {
  const parts = parseContent(content);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <Link key={i} to={`/title/${part.id}`} className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
            {part.title}
          </Link>
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </span>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { currentPerson } = usePerson();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, person: currentPerson }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: 'assistant', content: data.error }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Try again?' }]);
    } finally {
      setLoading(false);
      // Re-focus input on desktop
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <div className="pb-safe flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800/50 flex-shrink-0">
        <div className="px-4 pt-12 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Ask</h1>
              <p className="text-xs text-slate-500 mt-0.5">Ask anything about your movies & shows</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-slate-700 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium text-slate-500 mt-3">What would you like to know?</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-sm mx-auto">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-xs bg-slate-800 text-slate-300 rounded-full px-3 py-1.5 hover:bg-slate-700 active:bg-slate-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-amber-500 text-black rounded-br-sm'
                : 'bg-slate-800 text-slate-200 rounded-bl-sm'
            }`}>
              {msg.role === 'assistant'
                ? <MessageContent content={msg.content} />
                : msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — sits above NavBar */}
      <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 flex-shrink-0 mb-[calc(4rem+env(safe-area-inset-bottom))]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about movies, shows, lists..."
            className="flex-1 bg-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-amber-500/50 placeholder:text-slate-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black rounded-xl px-4 py-2.5 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
