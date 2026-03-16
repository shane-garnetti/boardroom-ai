"use client"

import { useEffect, useRef, useState } from "react"
import { DashboardHeader } from "./DashboardHeader"
import { AgentPanel } from "./AgentPanel"
import { ChatInput } from "@/components/chat/ChatInput"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { Message, MessageSegment, ToolCall } from "@/components/chat/types"

import { useGlobal } from "@/app/context/GlobalContext"
import { AgentCoreClient } from "@/lib/agentcore-client"
import type { AgentPattern } from "@/lib/agentcore-client"
import { useAuth } from "react-oidc-context"
import { useDefaultTool } from "@/hooks/useToolRenderer"
import { ToolCallDisplay } from "@/components/chat/ToolCallDisplay"
import { AGENTS, SPECIALIST_AGENTS } from "./agentConfig"
import type { AgentId } from "./agentConfig"

type StatusType = "idle" | "thinking" | "responding"

interface AgentPanelState {
  status: StatusType
  content: string
  prompt: string
}

const initialPanelState = (): Record<AgentId, AgentPanelState> => ({
  "business-advisor": { status: "idle", content: "", prompt: "" },
  "marketing-director": { status: "idle", content: "", prompt: "" },
  "cfo": { status: "idle", content: "", prompt: "" },
  "cto": { status: "idle", content: "", prompt: "" },
  "ciso": { status: "idle", content: "", prompt: "" },
})

export default function DashboardInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<AgentCoreClient | null>(null)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [panels, setPanels] = useState<Record<AgentId, AgentPanelState>>(initialPanelState)

  const { isLoading, setIsLoading } = useGlobal()
  const auth = useAuth()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useDefaultTool(({ name, args, status, result }) => (
    <ToolCallDisplay name={name} args={args} status={status} result={result} />
  ))

  // Load agent configuration and create client on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/aws-exports.json")
        if (!response.ok) throw new Error("Failed to load configuration")
        const config = await response.json()

        if (!config.agentRuntimeArn) throw new Error("Agent Runtime ARN not found in configuration")

        const agentClient = new AgentCoreClient({
          runtimeArn: config.agentRuntimeArn,
          region: config.awsRegion || "us-east-1",
          pattern: (config.agentPattern || "claude-agent-sdk-multi-agent") as AgentPattern,
        })

        setClient(agentClient)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        setError(`Configuration error: ${errorMessage}`)
      }
    }
    loadConfig()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || !client) return

    setError(null)

    // Add user message
    const newUserMessage: Message = {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, newUserMessage])
    setInput("")
    setIsLoading(true)

    // Reset specialist panels, set advisor to thinking
    setPanels(prev => ({
      ...prev,
      "business-advisor": { status: "thinking", content: "", prompt: "" },
      "marketing-director": { status: "idle", content: "", prompt: "" },
      "cfo": { status: "idle", content: "", prompt: "" },
      "cto": { status: "idle", content: "", prompt: "" },
      "ciso": { status: "idle", content: "", prompt: "" },
    }))

    // Create placeholder for assistant response
    const assistantResponse: Message = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantResponse])

    try {
      const accessToken = auth.user?.access_token
      if (!accessToken) throw new Error("Authentication required. Please log in again.")

      const segments: MessageSegment[] = []
      const toolCallMap = new Map<string, ToolCall>()

      const updateMessage = () => {
        const content = segments
          .filter((s): s is Extract<MessageSegment, { type: "text" }> => s.type === "text")
          .map(s => s.content)
          .join("")

        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content,
            segments: [...segments],
          }
          return updated
        })
      }

      await client.invoke(userMessage, sessionId, accessToken, event => {
        switch (event.type) {
          case "text": {
            // Text from supervisor → Business Advisor panel
            const prev = segments[segments.length - 1]
            if (prev && prev.type === "tool") {
              for (const tc of toolCallMap.values()) {
                if (tc.status === "streaming" || tc.status === "executing") {
                  tc.status = "complete"
                }
              }
            }
            const last = segments[segments.length - 1]
            if (last && last.type === "text") {
              last.content += event.content
            } else {
              segments.push({ type: "text", content: event.content })
            }

            // Update advisor panel content
            setPanels(prev => ({
              ...prev,
              "business-advisor": {
                ...prev["business-advisor"],
                status: "responding",
                content: prev["business-advisor"].content + event.content,
              },
            }))

            updateMessage()
            break
          }

          case "subagent_start": {
            // A specialist agent has been delegated to
            const agentId = event.agent as AgentId
            if (AGENTS[agentId]) {
              setPanels(prev => ({
                ...prev,
                [agentId]: {
                  status: "thinking" as StatusType,
                  content: "",
                  prompt: event.prompt,
                },
              }))
            }
            break
          }

          case "subagent_result": {
            // A specialist agent has returned its response
            const agentId = event.agent as AgentId
            if (AGENTS[agentId]) {
              setPanels(prev => ({
                ...prev,
                [agentId]: {
                  ...prev[agentId],
                  status: "responding" as StatusType,
                  content: event.content,
                },
              }))
            }
            break
          }

          case "tool_use_start": {
            const tc: ToolCall = {
              toolUseId: event.toolUseId,
              name: event.name,
              input: "",
              status: "streaming",
            }
            toolCallMap.set(event.toolUseId, tc)
            segments.push({ type: "tool", toolCall: tc })
            updateMessage()
            break
          }

          case "tool_use_delta": {
            const tc = toolCallMap.get(event.toolUseId)
            if (tc) tc.input += event.input
            updateMessage()
            break
          }

          case "tool_result": {
            const tc = toolCallMap.get(event.toolUseId)
            if (tc) {
              tc.result = event.result
              tc.status = "complete"
            }
            updateMessage()
            break
          }

          case "message": {
            if (event.role === "assistant") {
              for (const tc of toolCallMap.values()) {
                if (tc.status === "streaming") tc.status = "executing"
              }
              updateMessage()
            }
            break
          }
        }
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(`Failed to get response: ${errorMessage}`)

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "I apologize, but I encountered an error processing your request. Please try again.",
        }
        return updated
      })
    } finally {
      setIsLoading(false)
      // Set all active panels to final state
      setPanels(prev => {
        const next = { ...prev }
        for (const key of Object.keys(next) as AgentId[]) {
          if (next[key].status === "thinking" && !next[key].content) {
            next[key] = { ...next[key], status: "idle" }
          } else if (next[key].status === "thinking" || next[key].status === "responding") {
            next[key] = { ...next[key], status: "responding" }
          }
        }
        return next
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  /**
   * Re-invoke ONLY the target specialist with follow-up context.
   * Preserves all other panels; only updates the target agentId panel.
   */
  const sendFollowUp = async (agentId: AgentId, answer: string) => {
    if (!client || isLoading) return
    setError(null)
    setIsLoading(true)

    const agentName = AGENTS[agentId].name

    // Reset only the target panel to "thinking"
    setPanels(prev => ({
      ...prev,
      [agentId]: { status: "thinking", content: "", prompt: "" },
    }))

    try {
      const accessToken = auth.user?.access_token
      if (!accessToken) throw new Error("Authentication required. Please log in again.")

      await client.invoke(
        `[Directed follow-up for ${agentName} only] The user provided additional context in response to ${agentName}'s follow-up question: "${answer}". Please re-invoke ONLY the ${agentName} specialist with this new information. Do not re-invoke any other specialists.`,
        sessionId,
        accessToken,
        event => {
          if (event.type === "subagent_result") {
            const resultId = event.agent as AgentId
            if (resultId === agentId && AGENTS[resultId]) {
              setPanels(prev => ({
                ...prev,
                [resultId]: { ...prev[resultId], status: "responding", content: event.content },
              }))
            }
          }
        }
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(`Follow-up failed: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setPanels(prev => {
        if (prev[agentId].status === "thinking") {
          return { ...prev, [agentId]: { ...prev[agentId], status: "idle" } }
        }
        return prev
      })
    }
  }

  const handleReset = () => {
    setMessages([])
    setInput("")
    setError(null)
    setPanels(initialPanelState())
  }

  const hasMessages = messages.length > 0
  const advisorConfig = AGENTS["business-advisor"]

  // Build agent statuses for header
  const agentStatuses = Object.fromEntries(
    Object.entries(panels).map(([id, state]) => [id, state.status])
  ) as Record<AgentId, StatusType>

  return (
    <div className="flex flex-col h-screen w-full bg-black">
      <DashboardHeader
        onReset={handleReset}
        canReset={hasMessages}
        agentStatuses={agentStatuses}
      />

      {error && (
        <div className="bg-red-900/30 border-l-4 border-red-500 p-3 mx-4 mt-2">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!hasMessages ? (
        // Welcome state
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Startup Command Center</h2>
            <p className="text-gray-400 text-lg mb-1">Powered by AWS Bedrock AgentCore.</p>
            <div className="flex justify-center gap-4 mt-4">
              {SPECIALIST_AGENTS.map(id => {
                const agent = AGENTS[id]
                return (
                  <div key={id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${agent.bgColor} border ${agent.color}`}>
                    <span className={`font-semibold text-xs ${agent.textColor}`}>{agent.iconLabel}</span>
                    <span className={`text-xs ${agent.textColor}`}>{agent.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="w-full max-w-2xl">
            <ChatInput
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
            />
            <p className="text-xs text-gray-500 text-center mt-3">
              Try: "I want to build an AI-powered tutoring platform for K-12 students"
            </p>
          </div>
        </div>
      ) : (
        // Dashboard layout
        <div className="flex-1 flex min-h-0">
          {/* Left: Business Advisor chat */}
          <div className={`w-[42%] flex flex-col border-r-2 ${advisorConfig.color} bg-zinc-900`}>
            {/* Advisor header */}
            <div className={`flex items-center gap-3 px-4 py-3 ${advisorConfig.bgColor} border-b`}>
              <div className={`flex items-center justify-center w-9 h-9 rounded-full ${advisorConfig.textColor} bg-white font-bold text-sm border`}>
                {advisorConfig.iconLabel}
              </div>
              <div>
                <h3 className={`font-semibold text-sm ${advisorConfig.textColor}`}>{advisorConfig.name}</h3>
                <p className="text-xs text-gray-400">{advisorConfig.title}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-gray-100"
                  }`}>
                    {msg.role === "assistant" && msg.segments ? (
                      <div className="prose prose-sm max-w-none">
                        {msg.segments.map((seg, j) =>
                          seg.type === "text" ? (
                            <MarkdownRenderer key={j} content={seg.content} />
                          ) : (
                            <ToolCallDisplay
                              key={j}
                              name={seg.toolCall.name}
                              args={seg.toolCall.input}
                              status={seg.toolCall.status}
                              result={seg.toolCall.result}
                            />
                          )
                        )}
                      </div>
                    ) : msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && !panels["business-advisor"].content && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 rounded-lg px-4 py-3">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-none border-t border-zinc-700 px-3 py-2">
              <ChatInput
                input={input}
                setInput={setInput}
                handleSubmit={handleSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Right: Specialist panels */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0 overflow-hidden bg-black">
            {SPECIALIST_AGENTS.map(id => (
              <AgentPanel
                key={id}
                agentId={id}
                status={panels[id].status}
                content={panels[id].content}
                prompt={panels[id].prompt}
                onFollowUp={answer => sendFollowUp(id, answer)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
