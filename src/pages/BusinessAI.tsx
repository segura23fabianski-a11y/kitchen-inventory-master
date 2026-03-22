import { useState, useRef, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Trash2, Sparkles } from "lucide-react";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Dónde estoy perdiendo dinero?",
  "¿Qué productos tienen bajo margen?",
  "¿Cuál es el contrato menos rentable?",
  "Dame un resumen ejecutivo del negocio",
  "¿Hay consumo inusual en algún producto?",
  "¿Cómo va la ocupación del hotel?",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/business-ai`;

export default function BusinessAI() {
  const restaurantId = useRestaurantId();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !restaurantId) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, restaurantId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Error del servidor" }));
        upsertAssistant(`⚠️ ${err.error || "Error al procesar la solicitud"}`);
        setIsLoading(false);
        return;
      }

      if (!resp.body) { upsertAssistant("⚠️ Sin respuesta del servidor"); setIsLoading(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
      upsertAssistant("⚠️ Error de conexión. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100dvh-6rem)] max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Asistente IA de Negocio</h1>
            <p className="text-xs text-muted-foreground">Analiza datos reales, detecta problemas y genera recomendaciones</p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground" onClick={() => setMessages([])}>
              <Trash2 className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>

        {/* Messages area */}
        <ScrollArea ref={scrollRef} className="flex-1 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-foreground">¿En qué puedo ayudarte?</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Puedo analizar ventas, costos, inventario, contratos, hotel y más. Pregúntame lo que necesites.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-1">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content || (isLoading && i === messages.length - 1 ? "..." : "")}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border pt-3 shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              className="min-h-[44px] max-h-32 resize-none rounded-xl"
              rows={1}
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="h-11 w-11 rounded-xl shrink-0"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || !restaurantId}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            La IA analiza datos reales de tu negocio respetando tus permisos de acceso
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
