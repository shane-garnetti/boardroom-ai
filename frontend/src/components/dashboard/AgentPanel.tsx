import { useEffect, useRef, useState } from "react"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { AGENTS } from "./agentConfig"
import type { AgentId } from "./agentConfig"

type StatusType = "idle" | "thinking" | "responding"

interface AgentPanelProps {
  agentId: AgentId
  status: StatusType
  content: string
  prompt?: string
  onFollowUp?: (answer: string) => void
}

/** Split content into main body and optional follow-up question */
function parseFollowUp(content: string): { body: string; question: string | null } {
  const markerNewline = "\nFOLLOW_UP:"
  const markerStart = "FOLLOW_UP:"
  const idx = content.indexOf(markerNewline)
  if (idx !== -1) {
    return {
      body: content.slice(0, idx).trim(),
      question: content.slice(idx + markerNewline.length).trim(),
    }
  }
  if (content.trimStart().startsWith(markerStart)) {
    return { body: "", question: content.replace(markerStart, "").trim() }
  }
  return { body: content, question: null }
}

function StatusBadge({ status }: { status: StatusType }) {
  if (status === "thinking") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <span className="animate-pulse">Analyzing...</span>
      </span>
    )
  }
  if (status === "responding") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Complete
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      Standby
    </span>
  )
}

function ThinkingAnimation() {
  return (
    <div className="flex items-center gap-2 py-4">
      <div className="flex gap-1">
        <div className="h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-sm text-amber-600 italic">Thinking...</span>
    </div>
  )
}

const sendButtonColor: Record<AgentId, string> = {
  "business-advisor": "bg-indigo-600 hover:bg-indigo-700",
  "marketing-director": "bg-emerald-600 hover:bg-emerald-700",
  "cfo": "bg-amber-600 hover:bg-amber-700",
  "cto": "bg-sky-600 hover:bg-sky-700",
}

export function AgentPanel({ agentId, status, content, prompt, onFollowUp }: AgentPanelProps) {
  const config = AGENTS[agentId]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [followUpAnswer, setFollowUpAnswer] = useState("")
  const [followUpSubmitted, setFollowUpSubmitted] = useState(false)

  // Reset follow-up state when content is cleared (new conversation)
  useEffect(() => {
    if (!content) {
      setFollowUpAnswer("")
      setFollowUpSubmitted(false)
    }
  }, [content])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content, followUpSubmitted])

  const { body, question } = parseFollowUp(content)

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUpAnswer.trim() || !onFollowUp) return
    onFollowUp(followUpAnswer.trim())
    setFollowUpSubmitted(true)
  }

  return (
    <div className={`flex flex-col h-full rounded-lg border-2 ${config.color} bg-white overflow-hidden shadow-sm`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${config.bgColor} border-b`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-full ${config.textColor} bg-white font-bold text-sm border-2 ${config.color}`}>
            {config.iconLabel}
          </div>
          <div>
            <h3 className={`font-semibold text-sm ${config.textColor}`}>{config.name}</h3>
            <p className="text-xs text-gray-500">{config.title}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 min-h-0">
        {status === "idle" && !content && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
              <span className={`text-lg font-bold ${config.textColor}`}>{config.iconLabel}</span>
            </div>
            <p className="text-xs text-gray-400 text-center italic">
              Waiting to be briefed...
            </p>
          </div>
        )}

        {status === "thinking" && !content && (
          <div>
            {prompt && (
              <div className={`mb-3 p-3 ${config.bgColor} rounded-md border ${config.color} opacity-80`}>
                <p className={`text-xs font-semibold ${config.textColor} mb-1`}>📋 Briefing received:</p>
                <p className="text-xs text-gray-600 line-clamp-4 italic">{prompt}</p>
              </div>
            )}
            <ThinkingAnimation />
          </div>
        )}

        {content && (
          <div>
            {/* Speech bubble header */}
            <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${config.color} border-opacity-30`}>
              <div className={`w-6 h-6 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                <span className={`text-xs font-bold ${config.textColor}`}>{config.iconLabel}</span>
              </div>
              <span className={`text-xs font-semibold ${config.textColor}`}>{config.name} says:</span>
            </div>

            {/* Main response */}
            <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
              <MarkdownRenderer content={body} />
            </div>

            {/* Follow-up question input */}
            {question && !followUpSubmitted && (
              <div className={`mt-4 p-3 rounded-lg border-2 ${config.color} ${config.bgColor}`}>
                <p className={`text-xs font-semibold ${config.textColor} mb-1.5 flex items-center gap-1`}>
                  💬 One quick question for you:
                </p>
                <p className="text-sm text-gray-700 mb-3">{question}</p>
                <form onSubmit={handleFollowUpSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={followUpAnswer}
                    onChange={e => setFollowUpAnswer(e.target.value)}
                    placeholder="Your answer..."
                    className={`flex-1 text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-offset-1`}
                    style={{ minWidth: 0 }}
                  />
                  <button
                    type="submit"
                    disabled={!followUpAnswer.trim()}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-opacity disabled:opacity-40 ${sendButtonColor[agentId]}`}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* Submitted confirmation */}
            {question && followUpSubmitted && (
              <div className={`mt-4 p-3 rounded-lg border ${config.color} ${config.bgColor} opacity-60`}>
                <p className={`text-xs ${config.textColor} flex items-center gap-1`}>
                  ✅ Answer sent — updating analysis...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
