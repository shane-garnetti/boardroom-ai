import { useEffect, useRef, useState } from "react"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { AGENTS } from "./agentConfig"
import type { AgentId } from "./agentConfig"

type StatusType = "idle" | "thinking" | "responding"

interface DocEntry { filename: string; text: string }

interface AgentPanelProps {
  agentId: AgentId
  status: StatusType
  content: string
  prompt?: string
  uploadedDocs?: DocEntry[]
  onFollowUp?: (answer: string) => void
  onFileUpload?: (file: File) => Promise<string | null>
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

const sendButtonColor: Partial<Record<AgentId, string>> = {
  "business-advisor": "bg-indigo-600 hover:bg-indigo-700",
  "marketing-director": "bg-emerald-600 hover:bg-emerald-700",
  "cfo": "bg-amber-600 hover:bg-amber-700",
  "cto": "bg-sky-600 hover:bg-sky-700",
  "ciso": "bg-rose-600 hover:bg-rose-700",
  "senior-web-developer": "bg-violet-600 hover:bg-violet-700",
  "ma-advisor": "bg-purple-600 hover:bg-purple-700",
  "ip-attorney": "bg-slate-600 hover:bg-slate-700",
  "hr-talent": "bg-teal-600 hover:bg-teal-700",
  "healthcare-compliance": "bg-cyan-600 hover:bg-cyan-700",
  "data-privacy": "bg-orange-600 hover:bg-orange-700",
  "supply-chain": "bg-yellow-600 hover:bg-yellow-700",
  "regulatory-affairs": "bg-fuchsia-600 hover:bg-fuchsia-700",
  "international-expansion": "bg-blue-600 hover:bg-blue-700",
  "esg-advisor": "bg-lime-600 hover:bg-lime-700",
}

const ACCEPTED_FILE_TYPES = ".pdf,.png,.jpg,.jpeg,.csv,.txt"

export function AgentPanel({ agentId, status, content, prompt, uploadedDocs = [], onFollowUp, onFileUpload }: AgentPanelProps) {
  const config = AGENTS[agentId]
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [followUpAnswer, setFollowUpAnswer] = useState("")
  const [followUpSubmitted, setFollowUpSubmitted] = useState(false)
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)

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
  }, [content, followUpSubmitted, uploadedDocs])

  const { body, question } = parseFollowUp(content)

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUpAnswer.trim() || !onFollowUp) return
    onFollowUp(followUpAnswer.trim())
    setFollowUpSubmitted(true)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onFileUpload) return
    e.target.value = "" // reset so same file can be re-uploaded
    setUploadState("uploading")
    setUploadError(null)
    const result = await onFileUpload(file)
    if (result === null) {
      setUploadState("error")
      setUploadError("Upload failed — try again")
      setTimeout(() => { setUploadState("idle"); setUploadError(null) }, 3000)
    } else {
      setUploadState("idle")
    }
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
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {/* Upload button */}
          {onFileUpload && (
            <button
              type="button"
              title="Upload document (PDF, PNG, CSV, TXT)"
              disabled={uploadState === "uploading"}
              onClick={() => fileInputRef.current?.click()}
              className={`p-1.5 rounded-md transition-colors ${
                uploadState === "uploading"
                  ? "opacity-50 cursor-not-allowed"
                  : `hover:bg-white/60 ${config.textColor}`
              }`}
            >
              {uploadState === "uploading" ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Uploaded docs strip */}
      {uploadedDocs.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 px-3 py-1.5 border-b ${config.bgColor}`}>
          {uploadedDocs.map((doc, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white border ${config.color} ${config.textColor}`}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {doc.filename}
            </span>
          ))}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="px-3 py-1 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{uploadError}</p>
        </div>
      )}

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
            {onFileUpload && (
              <p className="text-xs text-gray-400 text-center">
                📎 Upload a document to add context
              </p>
            )}
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
                    className="flex-1 text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
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
