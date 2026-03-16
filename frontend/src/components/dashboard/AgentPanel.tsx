import { useEffect, useRef } from "react"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { AGENTS } from "./agentConfig"
import type { AgentId } from "./agentConfig"

type StatusType = "idle" | "thinking" | "responding"

interface AgentPanelProps {
  agentId: AgentId
  status: StatusType
  content: string
  prompt?: string
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
      <span className="text-sm text-amber-600">Working on analysis...</span>
    </div>
  )
}

export function AgentPanel({ agentId, status, content, prompt }: AgentPanelProps) {
  const config = AGENTS[agentId]
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content])

  return (
    <div className={`flex flex-col h-full rounded-lg border-2 ${config.color} bg-white overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${config.bgColor} border-b`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-full ${config.textColor} bg-white font-bold text-sm border`}>
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
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 text-center">
              {config.description}
            </p>
          </div>
        )}

        {status === "thinking" && !content && (
          <div>
            {prompt && (
              <div className="mb-3 p-3 bg-gray-50 rounded-md border">
                <p className="text-xs text-gray-500 mb-1 font-medium">Task received:</p>
                <p className="text-sm text-gray-700 line-clamp-3">{prompt}</p>
              </div>
            )}
            <ThinkingAnimation />
          </div>
        )}

        {content && (
          <div className="prose prose-sm max-w-none">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
