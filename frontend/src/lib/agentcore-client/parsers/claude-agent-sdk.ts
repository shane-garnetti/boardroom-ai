// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ChunkParser } from "../types"

/**
 * Parses SSE chunks from Claude Agent SDK agents.
 * Emits typed StreamEvents for text, tool use, subagent delegation, and session lifecycle.
 *
 * Event shapes from the agent:
 * - {"data": "text"}                          → text content
 * - {"current_tool_use": {...}}               → tool use (complete per event)
 * - {"subagent_start": {agent, prompt}}       → subagent delegation started
 * - {"subagent_result": {agent, content}}     → subagent response received
 * - {"claude_session_id": "..."}              → session ID for resumption
 */
export const parseClaudeAgentSdkChunk: ChunkParser = (line, callback) => {
  if (!line.startsWith("data: ")) return

  const data = line.substring(6).trim()
  if (!data) return

  try {
    const json = JSON.parse(data)

    // Text streaming
    if (typeof json.data === "string") {
      callback({ type: "text", content: json.data })
      return
    }

    // Subagent start — a specialist agent has been delegated to
    if (json.subagent_start) {
      callback({
        type: "subagent_start",
        agent: json.subagent_start.agent || "unknown",
        prompt: json.subagent_start.prompt || "",
      })
      return
    }

    // Subagent result — a specialist agent has returned its response
    if (json.subagent_result) {
      callback({
        type: "subagent_result",
        agent: json.subagent_result.agent || "unknown",
        content: json.subagent_result.content || "",
      })
      return
    }

    // Tool use — claude-agent-sdk sends complete tool info per event
    if (json.current_tool_use) {
      const tool = json.current_tool_use

      // Skip emitting tool_use events for Task tool — handled via subagent events
      if (tool.name === "Task") {
        return
      }

      callback({
        type: "tool_use_start",
        toolUseId: tool.toolUseId,
        name: tool.name,
      })
      if (tool.input) {
        callback({
          type: "tool_use_delta",
          toolUseId: tool.toolUseId,
          input: JSON.stringify(tool.input),
        })
      }
      return
    }

    // Claude session ID for conversation resumption
    if (json.claude_session_id) {
      callback({ type: "lifecycle", event: "session_id" })
      return
    }
  } catch {
    console.debug("Failed to parse claude-agent-sdk event:", data)
  }
}
